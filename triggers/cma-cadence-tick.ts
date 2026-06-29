import { logger, metadata, schedules } from "@trigger.dev/sdk/v3";

import { runCmaCadenceTick } from "@/lib/listing-studio/cma/cadence-tick";

// ============================================================
// CMA cadence tick — runs hourly on Trigger.dev's native scheduler.
//
// Walks every enrolled, non-paused client whose next_due_at has
// passed and fires one cma-deliver task per row. The Vercel cron +
// /api/cron/cma-tick HTTP wrapper that used to drive this are gone —
// declarative schedules on Trigger.dev are the source of truth, and
// they only fire for the latest deployment so dev/staging/prod stay
// isolated.
//
// Single-instance concurrency: only one tick at a time across the
// project so we never enqueue the same client's delivery twice via
// overlapping ticks (the per-client idempotency key inside
// runCmaCadenceTick is the second line of defense).
// ============================================================

export const cmaCadenceTickTask = schedules.task({
  id: "cma-cadence-tick",
  cron: "0 * * * *",
  queue: {
    name: "cma-cadence-tick",
    concurrencyLimit: 1,
  },
  maxDuration: 5 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "listing-studio");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "scanning");

    logger.log("CMA cadence tick starting", {
      scheduledAt: payload.timestamp.toISOString(),
      lastTimestamp: payload.lastTimestamp?.toISOString() ?? null,
    });

    const result = await runCmaCadenceTick();

    metadata.set("step", "completed");
    metadata.set("candidates", result.candidates);
    metadata.set("fired", result.fired);
    metadata.set("skipped", result.skipped);
    await metadata.flush();

    logger.log("CMA cadence tick finished", { ...result });

    return result;
  },
});
