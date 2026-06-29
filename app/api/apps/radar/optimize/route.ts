import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  getBrandReportPrompt,
  getContentCheck,
  listBrandReports,
  listBrandReportPrompts,
  listContentChecks,
  listCrawlabilityChecks,
  listWorkspaces,
} from "@/lib/radar-otterly/accessors";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type {
  OtterlyAuditCheck,
  OtterlyBrandReport,
  OtterlyContentCheckDetail,
  OtterlyPromptSummary,
} from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================
// Optimize tab API — customer-facing insights, not admin tooling.
//
// Aggregates everything the agent needs to answer "what should I
// do this week to improve my AI visibility?":
//
//   - siteHealth: latest content check for the agent's homepage
//     (the rich GEO-readiness audit Otterly produces).
//   - wins / quickWins / gaps: prompt categorization driven by
//     brand mention status + rank.
//   - contentChecks / crawlabilityChecks: full history for the
//     audit form's history list.
//
// Otterly's "add more competitors/prompts" recommendations live
// in the admin queue (those are AiM-side ops actions, not
// customer chores). Not surfaced here.
// ============================================================

export interface OptimizePromptInsight {
  id: string;
  rank: number;
  prompt: string;
  brandMentions: number;
  brandRank: number | null;
  intentVolume: number;
  /** Top competitor brand winning this prompt, when known. Helps the
   *  agent see who to study for the gap. */
  topCompetitor: string | null;
  topCompetitorRank: number | null;
}

interface OptimizeResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "no_matching_report"
    | "otterly_error";
  report?: OtterlyBrandReport;
  workspaceId?: string;
  defaultUrl?: string;
  siteHealth?: {
    /** The content check we pulled the scores from. null if none exists yet. */
    audit: OtterlyContentCheckDetail | null;
  };
  wins?: OptimizePromptInsight[];
  quickWins?: OptimizePromptInsight[];
  gaps?: OptimizePromptInsight[];
  contentChecks?: OtterlyAuditCheck[];
  crawlabilityChecks?: OtterlyAuditCheck[];
  error?: { message: string; status: number };
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json({ status: "no_active_profile" } as OptimizeResponse);
  }

  const service = createServiceRoleClient();
  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("website_url")
    .eq("id", profile.id)
    .maybeSingle();
  const websiteUrl = (profileRow?.website_url ?? null) as string | null;
  const hostname = normalizeHostname(websiteUrl);
  if (!websiteUrl || !hostname) {
    return Response.json({ status: "no_website_url" } as OptimizeResponse);
  }

  try {
    const [reportsList, workspaces, contentList, crawlList] = await Promise.all(
      [
        listBrandReports(),
        listWorkspaces(),
        listContentChecks(),
        listCrawlabilityChecks(),
      ],
    );
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) {
      return Response.json({ status: "no_matching_report" } as OptimizeResponse);
    }

    const country = report.countries[0] ?? "us";
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .split("T")[0];

    // Pull prompts + the latest content check on the agent's homepage,
    // in parallel. The site-health lookup matches the customer's
    // hostname against the content-check URL — picks the most recent
    // finished one if multiple exist.
    const homepageContentChecks = contentList.items
      .filter((c) => {
        try {
          const u = new URL(c.url);
          return u.hostname.replace(/^www\./, "") === hostname;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );

    const [promptsRes, siteHealthAudit] = await Promise.all([
      listBrandReportPrompts(report.id, { startDate, endDate, country }),
      homepageContentChecks[0]
        ? getContentCheck(homepageContentChecks[0].id).catch(() => null)
        : Promise.resolve(null),
    ]);

    const prompts = promptsRes.items;

    // For each prompt, hydrate the brandRank + topCompetitor by
    // fetching per-prompt detail. Capped at 25 concurrent fetches —
    // typical brand report has 5-25 prompts so this is one round of
    // ~25 parallel calls. Trial accounts are small; if we move to
    // big-prompt reports this becomes a batched call.
    const detailMap = new Map<
      string,
      Awaited<ReturnType<typeof getBrandReportPrompt>>
    >();
    await Promise.all(
      prompts.map(async (p) => {
        try {
          const d = await getBrandReportPrompt(report.id, p.id, {
            startDate,
            endDate,
            country,
          });
          detailMap.set(p.id, d);
        } catch {
          // Skip — prompt detail unavailable, fallback to summary only
        }
      }),
    );

    const insights: OptimizePromptInsight[] = prompts.map((p) =>
      buildInsight(p, detailMap.get(p.id) ?? null, report.brand),
    );

    const wins = insights
      .filter((i) => i.brandRank != null && i.brandRank <= 3 && i.brandMentions > 0)
      .sort((a, b) => (a.brandRank ?? 99) - (b.brandRank ?? 99));

    const quickWins = insights
      .filter(
        (i) =>
          (i.brandMentions > 0 && (i.brandRank ?? 99) >= 4) ||
          (i.brandMentions === 0 && i.intentVolume > 0),
      )
      .sort((a, b) => b.intentVolume - a.intentVolume);

    const gaps = insights
      .filter(
        (i) =>
          i.brandMentions === 0 &&
          i.topCompetitor !== null &&
          i.intentVolume === 0,
      )
      .sort((a, b) => (a.topCompetitorRank ?? 99) - (b.topCompetitorRank ?? 99));

    const payload: OptimizeResponse = {
      status: "ready",
      report,
      workspaceId: workspaces.items[0]?.id ?? "",
      defaultUrl: websiteUrl.startsWith("http")
        ? websiteUrl
        : `https://${websiteUrl}`,
      siteHealth: { audit: siteHealthAudit },
      wins,
      quickWins,
      gaps,
      contentChecks: contentList.items,
      crawlabilityChecks: crawlList.items,
    };
    return Response.json(payload);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json({
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      } as OptimizeResponse);
    }
    return Response.json({
      status: "otterly_error",
      error: {
        message: e instanceof Error ? e.message : "Unknown error",
        status: 500,
      },
    } as OptimizeResponse);
  }
}

function buildInsight(
  summary: OtterlyPromptSummary,
  detail: Awaited<ReturnType<typeof getBrandReportPrompt>> | null,
  brandName: string,
): OptimizePromptInsight {
  // brandRank in summary doesn't exist — only in detail.
  const ranks = detail?.brandRank ?? [];
  const mainBrandRow = ranks.find(
    (r) => r.brand.toLowerCase() === brandName.toLowerCase(),
  );
  const brandRank = mainBrandRow?.rank ?? null;
  const competitorRow = ranks
    .filter((r) => r.brand.toLowerCase() !== brandName.toLowerCase())
    .sort((a, b) => a.rank - b.rank)[0];

  return {
    id: summary.id,
    rank: summary.rank,
    prompt: summary.prompt,
    brandMentions: summary.brandMentions ?? 0,
    brandRank,
    intentVolume: summary.volume ?? 0,
    topCompetitor: competitorRow?.brand ?? null,
    topCompetitorRank: competitorRow?.rank ?? null,
  };
}
