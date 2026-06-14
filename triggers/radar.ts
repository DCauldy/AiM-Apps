import { logger, metadata, schedules, task } from "@trigger.dev/sdk/v3";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runRadarCheck } from "@/lib/radar/run-check";
import { runRadarAudit } from "@/lib/radar/run-audit";
import type { CheckTrigger } from "@/types/radar";

// ============================================================
// Radar — AI visibility checks, website audits, retention cleanup.
//
// Four tasks in one file because they all share the radar feature
// area and the same metadata shape:
//
//   radarCheckTask         — run one user's visibility check against
//                            their configured AI engines. Triggered
//                            on-demand AND by the hourly tick below.
//
//   radarAuditTask         — crawl + score one user's website for
//                            AI-discoverability signals.
//
//   radarChecksTickTask    — hourly schedules.task. Finds users whose
//                            next_check_at has passed and fans out to
//                            radarCheckTask, bumping next_check_at
//                            forward by their cadence.
//
//   radarCleanupTask       — monthly schedules.task. Deletes
//                            radar_results rows older than 12 months
//                            to keep the table bounded.
// ============================================================

// ---------------------------------------------------------------------------
// radar-check — on-demand or tick-fired
// ---------------------------------------------------------------------------

interface RadarCheckPayload {
  userId: string;
  trigger: CheckTrigger;
}

export const radarCheckTask = task({
  id: "radar-check",
  queue: {
    name: "radar-check",
    concurrencyLimit: 3,
  },
  retry: { maxAttempts: 3 },
  maxDuration: 15 * 60,
  run: async (payload: RadarCheckPayload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("userId", payload.userId);
    metadata.set("trigger", payload.trigger);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "running");

    logger.log("Radar check starting", {
      userId: payload.userId,
      trigger: payload.trigger,
    });

    const result = await runRadarCheck({
      userId: payload.userId,
      trigger: payload.trigger,
    });

    metadata.set("step", "completed");
    metadata.set("checkId", result.checkId);
    if ("visibilityScore" in result && result.visibilityScore !== undefined) {
      metadata.set("visibilityScore", result.visibilityScore);
    }
    metadata.set("resultsCount", result.resultsCount);
    await metadata.flush();

    logger.log("Radar check finished", {
      checkId: result.checkId,
      resultsCount: result.resultsCount,
    });

    return result;
  },
});

// ---------------------------------------------------------------------------
// radar-audit — on-demand website crawl + score
// ---------------------------------------------------------------------------

interface RadarAuditPayload {
  userId: string;
  url: string;
}

export const radarAuditTask = task({
  id: "radar-audit",
  queue: {
    name: "radar-audit",
    concurrencyLimit: 2,
  },
  retry: { maxAttempts: 2 },
  maxDuration: 20 * 60,
  run: async (payload: RadarAuditPayload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("userId", payload.userId);
    metadata.set("url", payload.url);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "crawling");

    logger.log("Radar audit starting", {
      userId: payload.userId,
      url: payload.url,
    });

    const result = await runRadarAudit({
      userId: payload.userId,
      url: payload.url,
    });

    metadata.set("step", "completed");
    if ("auditId" in result) metadata.set("auditId", result.auditId);
    if ("pagesAnalyzed" in result && result.pagesAnalyzed !== undefined) {
      metadata.set("pagesAnalyzed", result.pagesAnalyzed);
    }
    if ("overallScore" in result && result.overallScore !== undefined) {
      metadata.set("overallScore", result.overallScore);
    }
    await metadata.flush();

    logger.log("Radar audit finished", { ...result });

    return result;
  },
});

// ---------------------------------------------------------------------------
// radar-checks-tick — hourly schedule, fans out due users to radar-check
// ---------------------------------------------------------------------------

export const radarChecksTickTask = schedules.task({
  id: "radar-checks-tick",
  cron: "0 * * * *",
  queue: {
    name: "radar-checks-tick",
    concurrencyLimit: 1,
  },
  maxDuration: 5 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "scanning");

    const supabase = createServiceRoleClient();
    const now = new Date();

    const { data: dueConfigs, error } = await supabase
      .from("radar_config")
      .select("id, user_id, monitoring_frequency")
      .eq("onboarding_completed", true)
      .not("next_check_at", "is", null)
      .lte("next_check_at", now.toISOString());

    if (error) {
      logger.error("Radar checks tick: query failed", { message: error.message });
      throw new Error(`radar-checks-tick query: ${error.message}`);
    }

    const configs = (dueConfigs ?? []) as Array<{
      id: string;
      user_id: string;
      monitoring_frequency: string;
    }>;

    if (configs.length === 0) {
      metadata.set("step", "completed");
      metadata.set("triggered", 0);
      await metadata.flush();
      return { triggered: 0 };
    }

    // Fan out one radar-check task per due user. Per-user idempotency
    // keyed on (userId, hour-bucket) so overlapping ticks can't
    // enqueue the same user twice.
    const hourBucket = now.toISOString().slice(0, 13);
    await radarCheckTask.batchTrigger(
      configs.map((c) => ({
        payload: {
          userId: c.user_id,
          trigger: "scheduled" as const,
        },
        options: {
          idempotencyKey: `radar-check-${c.user_id}-${hourBucket}`,
          idempotencyKeyTTL: "2h",
          tags: [`radar-user:${c.user_id}`, "radar-trigger:scheduled"],
        },
      })),
    );

    // Bump next_check_at on each config so we don't refire next hour.
    // Done serially — config count is small (one per active radar user).
    for (const config of configs) {
      const nextCheckAt =
        config.monitoring_frequency === "weekly"
          ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await supabase
        .from("radar_config")
        .update({
          next_check_at: nextCheckAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", config.id);
    }

    metadata.set("step", "completed");
    metadata.set("triggered", configs.length);
    await metadata.flush();

    logger.log("Radar checks tick finished", { triggered: configs.length });
    return { triggered: configs.length };
  },
});

// ---------------------------------------------------------------------------
// radar-cleanup — monthly retention sweep (was an Inngest fn with no
// scheduler attached; now declared on Trigger.dev so it actually runs)
// ---------------------------------------------------------------------------

export const radarCleanupTask = schedules.task({
  id: "radar-cleanup",
  // 1st of each month, 06:00 UTC. Quiet window; the deletion is
  // cheap so timing isn't load-sensitive.
  cron: "0 6 1 * *",
  queue: {
    name: "radar-cleanup",
    concurrencyLimit: 1,
  },
  maxDuration: 10 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "radar");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "deleting");

    const supabase = createServiceRoleClient();

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoff = cutoffDate.toISOString();

    const { count } = await supabase
      .from("radar_results")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoff);

    const { error } = await supabase
      .from("radar_results")
      .delete()
      .lt("created_at", cutoff);

    if (error) {
      logger.error("Radar cleanup: delete failed", { message: error.message });
      throw new Error(`radar-cleanup: ${error.message}`);
    }

    metadata.set("step", "completed");
    metadata.set("deletedCount", count ?? 0);
    await metadata.flush();

    logger.log("Radar cleanup finished", { deletedCount: count ?? 0 });
    return { deletedCount: count ?? 0 };
  },
});
