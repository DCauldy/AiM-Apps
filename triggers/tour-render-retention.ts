import { logger, metadata, schedules } from "@trigger.dev/sdk/v3";

import { enforceThirtyDayGeneratedAssetRetention } from "@/lib/tours/rendering/repositories/tour-render-retention";

export const enforceTourRenderAssetRetentionTask = schedules.task({
  id: "enforce-tour-render-asset-retention",
  cron: {
    pattern: "0 8 * * *",
    timezone: "UTC",
  },
  queue: {
    name: "tour-render-asset-cleanup",
    concurrencyLimit: 1,
  },
  machine: "small-1x",
  maxDuration: 10 * 60,
  run: async () => {
    metadata.set("product", "tours");
    metadata.set("step", "retention_cleanup");

    logger.log("Tours render asset retention cleanup started.");

    const result = await enforceThirtyDayGeneratedAssetRetention({
      retentionDays: 30,
      batchSize: 50,
      maxBatches: 10,
    });

    metadata.set("status", result.ok ? "completed" : "failed");
    metadata.set("cutoffIso", result.cutoffIso);
    metadata.set("batches", result.batches);
    metadata.set("scanned", result.scanned);
    metadata.set("eligible", result.eligible);
    metadata.set("currentFinalProtected", result.currentFinalProtected);
    metadata.set("activeProtected", result.activeProtected);
    metadata.set("storageDeleted", result.storageDeleted);
    metadata.set("softDeleted", result.softDeleted);
    metadata.set("skipped", result.skipped);
    metadata.set("failed", result.failed);
    await metadata.flush();

    logger.log("Tours render asset retention cleanup finished.", result);
    return result;
  },
});
