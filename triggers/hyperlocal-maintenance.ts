import { logger, metadata, schedules } from "@trigger.dev/sdk/v3";

import { runHyperlocalCleanup } from "@/lib/hyperlocal/cleanup";
import { runHyperlocalEventsRollup } from "@/lib/hyperlocal/events-rollup";

// ============================================================
// Hyperlocal maintenance — daily storage cleanup + events rollup.
//
// Both replace Vercel cron entries that pointed at HTTP wrapper
// routes; now they run natively on Trigger.dev's scheduler. The
// 30-minute offset between them is intentional (cleanup at 03:30
// UTC, rollup at 04:00 UTC) — keeps the rollup from competing with
// cleanup for Supabase connections in case either spikes.
// ============================================================

export const hyperlocalCleanupTask = schedules.task({
  id: "hyperlocal-cleanup",
  cron: "30 3 * * *",
  queue: {
    name: "hyperlocal-cleanup",
    concurrencyLimit: 1,
  },
  maxDuration: 15 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "deleting");

    const result = await runHyperlocalCleanup();

    metadata.set("step", "completed");
    metadata.set("runsScanned", result.runs_scanned);
    metadata.set("filesDeleted", result.files_deleted);
    metadata.set("rowsNulled", result.rows_nulled);
    await metadata.flush();

    logger.log("Hyperlocal cleanup finished", { ...result });
    return result;
  },
});

export const hyperlocalEventsRollupTask = schedules.task({
  id: "hyperlocal-events-rollup",
  cron: "0 4 * * *",
  queue: {
    name: "hyperlocal-events-rollup",
    concurrencyLimit: 1,
  },
  maxDuration: 30 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "rolling-up");

    const result = await runHyperlocalEventsRollup();

    metadata.set("step", "completed");
    metadata.set("pages", result.pages);
    metadata.set("eventsProcessed", result.events_processed);
    metadata.set("eventsDeleted", result.events_deleted);
    await metadata.flush();

    logger.log("Hyperlocal events rollup finished", { ...result });
    return result;
  },
});
