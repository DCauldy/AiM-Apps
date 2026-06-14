import { logger, metadata, schedules, task } from "@trigger.dev/sdk/v3";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runBlogPipeline } from "@/lib/blog-engine/run-pipeline";
import { discoverTopicsForUser } from "@/lib/blog-engine/discover-topics";
import {
  getBofuUsage,
  reserveBlogSlot,
  refundBlogSlot,
} from "@/lib/blog-engine/usage";

// ============================================================
// Blog Engine — pipeline, topic discovery, hourly schedule tick.
//
//   blogPipelineTask        — one full blog (research → score →
//                             write → image → save → publish).
//                             Triggered on-demand from the runs API
//                             route (with pre-reserved slot) AND by
//                             the hourly tick below (reserves the
//                             slot itself before invoking the
//                             pipeline). Refunds on failure.
//
//   blogTopicsDiscoverTask  — runs the cheap discover+score path
//                             from the "Discover Topics" button.
//                             Does NOT consume a blog slot.
//
//   blogPipelineTickTask    — hourly schedules.task. Walks
//                             bofu_schedules where next_run_at has
//                             passed + is_active, skips users at
//                             quota, otherwise triggers
//                             blogPipelineTask + bumps next_run_at.
//                             Replaces the Vercel cron +
//                             /api/cron/blog-engine HTTP wrapper.
// ============================================================

interface BlogPipelinePayload {
  userId: string;
  triggeredBy: "schedule" | "manual" | "first_run";
  topicId?: string;
  /** True when the caller (runs API route) already reserved the
   *  slot. Cron-triggered runs don't pre-reserve and need the task
   *  to do it. */
  slotPreReserved?: boolean;
  /** Which bucket the pre-reserved slot came from (weekly vs bonus).
   *  Used by the refund path on failure. */
  usedBonus?: boolean;
}

export const blogPipelineTask = task({
  id: "blog-pipeline",
  queue: {
    name: "blog-pipeline",
    concurrencyLimit: 5,
  },
  retry: { maxAttempts: 3 },
  // 45min covers the worst-case pipeline (Perplexity research +
  // scoring + Claude long-form write + GPT-image-2 + CMS publish).
  maxDuration: 45 * 60,
  run: async (payload: BlogPipelinePayload, { ctx }) => {
    metadata.set("product", "blog-engine");
    metadata.set("userId", payload.userId);
    metadata.set("triggeredBy", payload.triggeredBy);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "reserving");

    // ---- Slot reservation (skip if caller pre-reserved) ----
    let usedBonus = !!payload.usedBonus;
    if (!payload.slotPreReserved) {
      const reservation = await reserveBlogSlot(payload.userId);
      if (!reservation.reserved) {
        logger.log("Blog pipeline: cap reached, skipping", {
          userId: payload.userId,
          blogs_generated: reservation.blogs_generated,
          blogs_limit: reservation.blogs_limit,
          bonus_blogs: reservation.bonus_blogs,
        });
        metadata.set("step", "skipped");
        metadata.set("reason", "usage_limit_reached");
        await metadata.flush();
        return { skipped: true, reason: "usage_limit_reached" };
      }
      usedBonus = !!reservation.used_bonus;
    }

    metadata.set("step", "running");
    metadata.set("usedBonus", usedBonus);
    if (payload.topicId) metadata.set("topicId", payload.topicId);

    logger.log("Blog pipeline starting", {
      userId: payload.userId,
      triggeredBy: payload.triggeredBy,
      topicId: payload.topicId ?? null,
    });

    try {
      const result = await runBlogPipeline({
        userId: payload.userId,
        triggeredBy: payload.triggeredBy,
        topicId: payload.topicId,
        runId: ctx.run.id,
      });

      metadata.set("step", "completed");
      if ("blogId" in result && result.blogId)
        metadata.set("blogId", result.blogId);
      if ("title" in result && result.title) metadata.set("title", result.title);
      await metadata.flush();

      logger.log("Blog pipeline finished", { userId: payload.userId, ...result });
      return result;
    } catch (err) {
      // Pipeline blew up after we reserved a slot. Refund so the
      // user doesn't lose this week's quota to a transient
      // Claude/Perplexity error.
      await refundBlogSlot(payload.userId, usedBonus).catch(() => {});

      // Best-effort: mark the most recent in-progress blog row as
      // failed so the dashboard surfaces it.
      const message = err instanceof Error ? err.message : String(err);
      const supabase = createServiceRoleClient();
      await supabase
        .from("bofu_blogs")
        .update({
          publish_status: "failed",
          pipeline_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", payload.userId)
        .in("publish_status", ["draft", "scheduled", "generating"])
        .order("created_at", { ascending: false })
        .limit(1);

      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// blog-engine-topics-discover — manual topic-bank refill (no slot consumed)
// ---------------------------------------------------------------------------

interface TopicsDiscoverPayload {
  userId: string;
}

export const blogTopicsDiscoverTask = task({
  id: "blog-engine-topics-discover",
  queue: {
    name: "blog-engine-topics-discover",
    concurrencyLimit: 3,
  },
  retry: { maxAttempts: 2 },
  maxDuration: 10 * 60,
  run: async (payload: TopicsDiscoverPayload, { ctx }) => {
    metadata.set("product", "blog-engine");
    metadata.set("userId", payload.userId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "discovering");

    logger.log("Blog topics discover starting", { userId: payload.userId });

    const result = await discoverTopicsForUser(payload.userId);

    metadata.set("step", "completed");
    await metadata.flush();

    logger.log("Blog topics discover finished", {
      userId: payload.userId,
      ...result,
    });
    return result;
  },
});

// ---------------------------------------------------------------------------
// blog-pipeline-tick — hourly schedule that fans out due users
// ---------------------------------------------------------------------------

export const blogPipelineTickTask = schedules.task({
  id: "blog-pipeline-tick",
  cron: "0 * * * *",
  queue: {
    name: "blog-pipeline-tick",
    concurrencyLimit: 1,
  },
  maxDuration: 5 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "blog-engine");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "scanning");

    const supabase = createServiceRoleClient();
    const now = new Date();

    const { data: dueSchedules, error } = await supabase
      .from("bofu_schedules")
      .select("*")
      .eq("is_active", true)
      .lte("next_run_at", now.toISOString());

    if (error) {
      logger.error("Blog tick: schedule query failed", { message: error.message });
      throw new Error(`blog-pipeline-tick query: ${error.message}`);
    }

    const schedulesDue = dueSchedules ?? [];
    let triggered = 0;
    let skipped = 0;

    for (const schedule of schedulesDue) {
      // Skip users at quota — the task wouldn't reserve a slot
      // anyway, but checking here avoids spinning up a no-op run.
      const usage = await getBofuUsage(schedule.user_id);
      if (usage.effectiveRemaining <= 0) {
        skipped += 1;
        continue;
      }

      await blogPipelineTask.trigger(
        {
          userId: schedule.user_id,
          triggeredBy: "schedule" as const,
        },
        {
          // No idempotency key here — the per-(user, hour) bucket
          // wouldn't add value because bofu_schedules' next_run_at
          // bump is the actual dedup mechanism.
          tags: [`blog-user:${schedule.user_id}`, "blog-trigger:schedule"],
        },
      );

      // Calculate and update next run time
      const nextRunAt = calculateNextRun(
        schedule.active_days,
        schedule.preferred_time,
        schedule.timezone,
      );
      await supabase
        .from("bofu_schedules")
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", schedule.id);

      triggered += 1;
    }

    metadata.set("step", "completed");
    metadata.set("triggered", triggered);
    metadata.set("skipped", skipped);
    await metadata.flush();

    logger.log("Blog tick finished", { triggered, skipped, total: schedulesDue.length });
    return { triggered, skipped, total: schedulesDue.length };
  },
});

// ---------------------------------------------------------------------------
// Helpers (copied verbatim from the old /api/cron/blog-engine route)
// ---------------------------------------------------------------------------

function calculateNextRun(
  activeDays: string[],
  preferredTime: string,
  _timezone: string,
): Date {
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const [hours, minutes] = (preferredTime || "08:00").split(":").map(Number);
  const now = new Date();

  // Start from tomorrow to avoid re-triggering today
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);

    const dayName = Object.entries(dayMap).find(
      ([, num]) => num === candidate.getDay(),
    )?.[0];

    if (dayName && activeDays.includes(dayName)) {
      candidate.setHours(hours, minutes, 0, 0);
      return candidate;
    }
  }

  // Fallback: tomorrow at preferred time
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}
