import { logger, metadata, schedules } from "@trigger.dev/sdk/v3";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getBrandReportStats,
  listBrandReports,
  listBrandReportPrompts,
  getBrandReportPrompt,
} from "@/lib/radar-otterly/accessors";
import { findReportForHostname, normalizeHostname } from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import {
  sendRadarAlertEmail,
  sendRadarDigestEmail,
  type RadarDigestStats,
} from "@/lib/radar-otterly/email";

// ============================================================
// Radar notifications — two scheduled tasks.
//
//   radar-daily-alerts (cron daily 14:00 UTC ≈ 9am ET)
//     For each profile with alerts_enabled, fetch latest Otterly
//     stats, compare main-brand rank + top-competitor against the
//     last snapshot stored in radar_notification_state. Fire alert
//     email on rank drop or new competitor pass. Dedup by skipping
//     if last_alert_sent_at within the last 24h with the same reason.
//
//   radar-weekly-digest (cron Mon 14:00 UTC)
//     Snapshot current Otterly stats + pick a top win + top gap from
//     the prompts list, email a digest. One per profile per week.
//
// Both walk every platform_profile that:
//   - has notification_state with the relevant toggle on (or no row
//     yet → default true)
//   - has a website_url that matches an Otterly brand report
//   - has an auth.users row with a real email
//
// ============================================================

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  website_url: string | null;
  reply_to_email: string | null;
};

type NotificationStateRow = {
  profile_id: string;
  alerts_enabled: boolean;
  digest_enabled: boolean;
  last_main_brand_rank: number | null;
  last_top_competitor_brand: string | null;
  last_top_competitor_rank: number | null;
  last_alert_sent_at: string | null;
  last_alert_reason: string | null;
  last_digest_sent_at: string | null;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadCandidates(
  toggleField: "alerts_enabled" | "digest_enabled",
): Promise<Array<{ profile: ProfileRow; state: NotificationStateRow | null }>> {
  const supabase = createServiceRoleClient();
  // Pull every profile that has a website_url set + the user is still
  // active. Notification opt-out lives on radar_notification_state;
  // missing row counts as opted-in.
  const { data: profiles, error } = await supabase
    .from("platform_profiles")
    .select(
      "id, user_id, display_name, full_name, website_url, reply_to_email",
    )
    .not("website_url", "is", null);

  if (error) {
    logger.error("[radar-notifications] profile query failed", {
      message: error.message,
    });
    return [];
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  if (profileRows.length === 0) return [];

  const { data: states } = await supabase
    .from("radar_notification_state")
    .select(
      "profile_id, alerts_enabled, digest_enabled, last_main_brand_rank, last_top_competitor_brand, last_top_competitor_rank, last_alert_sent_at, last_alert_reason, last_digest_sent_at",
    )
    .in(
      "profile_id",
      profileRows.map((p) => p.id),
    );

  const stateByProfile = new Map<string, NotificationStateRow>(
    (states ?? []).map((s) => [s.profile_id, s as NotificationStateRow]),
  );

  return profileRows
    .map((p) => ({
      profile: p,
      state: stateByProfile.get(p.id) ?? null,
    }))
    .filter(({ state }) => state == null || state[toggleField] === true);
}

async function getRequesterEmail(userId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

function dateWindow30Days() {
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];
  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Daily alerts
// ---------------------------------------------------------------------------

export const radarDailyAlertsTask = schedules.task({
  id: "radar-daily-alerts",
  cron: "0 14 * * *",
  queue: { name: "radar-daily-alerts", concurrencyLimit: 1 },
  maxDuration: 15 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);

    const supabase = createServiceRoleClient();
    const candidates = await loadCandidates("alerts_enabled");
    metadata.set("candidateCount", candidates.length);

    let alertsSent = 0;
    let snapshotsUpdated = 0;
    const { startDate, endDate } = dateWindow30Days();

    for (const { profile, state } of candidates) {
      const hostname = normalizeHostname(profile.website_url);
      if (!hostname) continue;

      try {
        const reportsList = await listBrandReports();
        const report = findReportForHostname(reportsList.items, hostname);
        if (!report) continue;

        const country = report.countries[0] ?? "us";
        const stats = await getBrandReportStats(report.id, {
          startDate,
          endDate,
          country,
        });

        const mentions = stats.competitorBrandsAnalysis.brandMentions ?? [];
        const mainBrand = mentions.find((b) => b.isMainBrand) ?? null;
        const competitors = mentions
          .filter((b) => !b.isMainBrand)
          .sort(
            (a, b) =>
              (a.averageRank ?? 99) - (b.averageRank ?? 99),
          );
        const topCompetitor = competitors[0] ?? null;

        const currentRank = mainBrand?.averageRank
          ? Math.round(mainBrand.averageRank)
          : null;
        const currentTopCompetitor = topCompetitor?.brand ?? null;
        const currentTopCompetitorRank = topCompetitor?.averageRank
          ? Math.round(topCompetitor.averageRank)
          : null;

        // Compare to last snapshot. Skip first run (no baseline).
        const priorRank = state?.last_main_brand_rank ?? null;
        const priorTopCompetitor = state?.last_top_competitor_brand ?? null;

        let alertReason: "rank_drop" | "competitor_pass" | null = null;
        let alertFromRank: number | undefined;
        let alertToRank: number | undefined;
        let alertCompetitor: string | undefined;

        if (
          priorRank != null &&
          currentRank != null &&
          currentRank > priorRank
        ) {
          alertReason = "rank_drop";
          alertFromRank = priorRank;
          alertToRank = currentRank;
        } else if (
          currentTopCompetitor &&
          priorTopCompetitor &&
          currentTopCompetitor !== priorTopCompetitor &&
          currentRank != null &&
          currentTopCompetitorRank != null &&
          currentTopCompetitorRank < currentRank
        ) {
          alertReason = "competitor_pass";
          alertCompetitor = currentTopCompetitor;
        }

        // Dedup: skip if same alert reason was sent in last 24h.
        const lastSent = state?.last_alert_sent_at
          ? new Date(state.last_alert_sent_at).getTime()
          : 0;
        const within24h = Date.now() - lastSent < 24 * 60 * 60 * 1000;
        const sameReason = state?.last_alert_reason === alertReason;
        const shouldSend = alertReason && !(within24h && sameReason);

        if (shouldSend && alertReason) {
          const email = await getRequesterEmail(profile.user_id);
          const toEmail = email ?? profile.reply_to_email ?? null;
          if (toEmail) {
            try {
              await sendRadarAlertEmail({
                toEmail,
                toName: profile.display_name ?? profile.full_name ?? null,
                hostname,
                reason: {
                  type: alertReason,
                  fromRank: alertFromRank,
                  toRank: alertToRank,
                  competitorBrand: alertCompetitor,
                },
              });
              alertsSent++;
            } catch (e) {
              logger.warn("[radar-daily-alerts] email send failed", {
                profileId: profile.id,
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }

        // Always update the snapshot — even if we didn't send (so the
        // next-day diff has fresh state).
        await supabase
          .from("radar_notification_state")
          .upsert(
            {
              profile_id: profile.id,
              user_id: profile.user_id,
              last_main_brand_rank: currentRank,
              last_top_competitor_brand: currentTopCompetitor,
              last_top_competitor_rank: currentTopCompetitorRank,
              last_snapshot_at: new Date().toISOString(),
              ...(shouldSend && alertReason
                ? {
                    last_alert_sent_at: new Date().toISOString(),
                    last_alert_reason: alertReason,
                  }
                : {}),
            },
            { onConflict: "profile_id" },
          );
        snapshotsUpdated++;
      } catch (e) {
        if (e instanceof OtterlyApiError) {
          logger.warn("[radar-daily-alerts] Otterly error", {
            profileId: profile.id,
            status: e.status,
            message: e.message,
          });
        } else {
          logger.error("[radar-daily-alerts] failure", {
            profileId: profile.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    metadata.set("alertsSent", alertsSent);
    metadata.set("snapshotsUpdated", snapshotsUpdated);
    await metadata.flush();
    logger.log("Radar daily alerts finished", {
      alertsSent,
      snapshotsUpdated,
    });
    return { alertsSent, snapshotsUpdated };
  },
});

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

export const radarWeeklyDigestTask = schedules.task({
  id: "radar-weekly-digest",
  // Mondays at 14:00 UTC ≈ 9am ET, a few hours before daily alerts so
  // they don't pile up in the inbox at the same minute.
  cron: "0 14 * * 1",
  queue: { name: "radar-weekly-digest", concurrencyLimit: 1 },
  maxDuration: 20 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);

    const supabase = createServiceRoleClient();
    const candidates = await loadCandidates("digest_enabled");
    metadata.set("candidateCount", candidates.length);

    let digestsSent = 0;
    const { startDate, endDate } = dateWindow30Days();

    for (const { profile } of candidates) {
      const hostname = normalizeHostname(profile.website_url);
      if (!hostname) continue;

      try {
        const reportsList = await listBrandReports();
        const report = findReportForHostname(reportsList.items, hostname);
        if (!report) continue;

        const country = report.countries[0] ?? "us";

        const [stats, promptsList] = await Promise.all([
          getBrandReportStats(report.id, { startDate, endDate, country }),
          listBrandReportPrompts(report.id, { startDate, endDate, country }),
        ]);

        const mentions = stats.competitorBrandsAnalysis.brandMentions ?? [];
        const mainBrand = mentions.find((b) => b.isMainBrand) ?? null;

        // Pick the top win + top gap by walking per-prompt details.
        // Slim list — typical brand report has <25 prompts.
        let topWin: { prompt: string; rank: number } | null = null;
        let topGap: {
          prompt: string;
          competitor: string;
          competitorRank: number;
        } | null = null;
        for (const p of promptsList.items) {
          try {
            const detail = await getBrandReportPrompt(report.id, p.id, {
              startDate,
              endDate,
              country,
            });
            const ranks = detail.brandRank ?? [];
            const main = ranks.find(
              (r) => r.brand.toLowerCase() === report.brand.toLowerCase(),
            );
            if (main && (topWin === null || main.rank < topWin.rank)) {
              topWin = { prompt: detail.prompt, rank: main.rank };
            }
            if (!main || main.rank > 5) {
              const winner = ranks
                .filter(
                  (r) => r.brand.toLowerCase() !== report.brand.toLowerCase(),
                )
                .sort((a, b) => a.rank - b.rank)[0];
              if (
                winner &&
                (topGap === null || winner.rank < topGap.competitorRank)
              ) {
                topGap = {
                  prompt: detail.prompt,
                  competitor: winner.brand,
                  competitorRank: winner.rank,
                };
              }
            }
          } catch {
            // Skip individual prompt failures.
          }
        }

        const totalMentions = stats.summary.totalMentions ?? 0;
        const totalPrompts = stats.totalPrompts ?? 0;
        const mentionRate =
          totalPrompts > 0 ? (totalMentions / totalPrompts) * 100 : 0;

        const digestStats: RadarDigestStats = {
          brandRank: mainBrand?.averageRank
            ? Math.round(mainBrand.averageRank)
            : null,
          mentionRate,
          totalMentions,
          citationRate: mainBrand?.domainCoverage
            ? Math.round(mainBrand.domainCoverage)
            : stats.summary.domainCoverage
              ? Math.round(stats.summary.domainCoverage)
              : 0,
          topWin: topWin?.prompt ?? null,
          topGap: topGap?.prompt ?? null,
          topCompetitor: topGap?.competitor ?? null,
        };

        const email = await getRequesterEmail(profile.user_id);
        const toEmail = email ?? profile.reply_to_email ?? null;
        if (!toEmail) continue;

        try {
          await sendRadarDigestEmail({
            toEmail,
            toName: profile.display_name ?? profile.full_name ?? null,
            hostname,
            stats: digestStats,
          });
          digestsSent++;
          await supabase
            .from("radar_notification_state")
            .upsert(
              {
                profile_id: profile.id,
                user_id: profile.user_id,
                last_digest_sent_at: new Date().toISOString(),
              },
              { onConflict: "profile_id" },
            );
        } catch (e) {
          logger.warn("[radar-weekly-digest] email send failed", {
            profileId: profile.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } catch (e) {
        if (e instanceof OtterlyApiError) {
          logger.warn("[radar-weekly-digest] Otterly error", {
            profileId: profile.id,
            status: e.status,
            message: e.message,
          });
        } else {
          logger.error("[radar-weekly-digest] failure", {
            profileId: profile.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    metadata.set("digestsSent", digestsSent);
    await metadata.flush();
    logger.log("Radar weekly digest finished", { digestsSent });
    return { digestsSent };
  },
});
