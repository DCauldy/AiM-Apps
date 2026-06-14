import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import { runHlDiscover } from "@/lib/hyperlocal/discover";
import { runHlGenerate } from "@/lib/hyperlocal/generate";

// ============================================================
// Hyperlocal pipeline pair — discover + generate. The send phase
// (with its per-recipient fan-out) lives in
// triggers/hyperlocal-send.ts; these two run sequentially via the
// chain inside hlDiscoverTask.
//
// Flow:
//   triggerDiscover(runId)         → hlDiscoverTask fires
//   hlDiscoverTask completes       → if nextPhase === "generate",
//                                    it triggers hlGenerateTask
//                                    directly (no human approval
//                                    needed for sub-threshold runs)
//   ...else the run sits in        → user picks ZIPs / uploads MLS,
//   "awaiting_service_area" /        the corresponding API route
//   "awaiting_mls" phase             calls triggerGenerate to resume
//   hlGenerateTask completes       → run lands in "review" — agent
//                                    approves, which fires the send
//                                    task (separate file).
// ============================================================

interface HlPipelinePayload {
  runId: string;
}

export const hlDiscoverTask = task({
  id: "hl-discover",
  queue: {
    name: "hl-discover",
    concurrencyLimit: 3,
  },
  retry: { maxAttempts: 2 },
  maxDuration: 15 * 60,
  run: async (payload: HlPipelinePayload, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("runId", payload.runId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "discovering");

    logger.log("Hyperlocal discover starting", { runId: payload.runId });

    const result = await runHlDiscover(payload.runId);

    metadata.set("step", "completed");
    metadata.set("nextPhase", result.nextPhase);
    metadata.set("contactsFetched", result.contactsFetched);
    metadata.set("segmentsCount", result.segmentsCount);
    metadata.set("pendingSegmentsCount", result.pendingSegmentsCount);
    await metadata.flush();

    logger.log("Hyperlocal discover finished", {
      runId: payload.runId,
      nextPhase: result.nextPhase,
      contactsFetched: result.contactsFetched,
      segmentsCount: result.segmentsCount,
    });

    // Auto-chain to generate when no human input needed (campaign
    // already had service_area_zips set AND every segment is
    // sub-threshold, so no MLS data is required).
    if (result.nextPhase === "generate") {
      await hlGenerateTask.trigger(
        { runId: payload.runId },
        { tags: [`hl-run:${payload.runId}`, "hl-trigger:auto-chain"] },
      );
    }

    return result;
  },
});

export const hlGenerateTask = task({
  id: "hl-generate",
  queue: {
    name: "hl-generate",
    concurrencyLimit: 3,
  },
  retry: { maxAttempts: 1 },
  maxDuration: 30 * 60,
  run: async (payload: HlPipelinePayload, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("runId", payload.runId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "generating");

    logger.log("Hyperlocal generate starting", { runId: payload.runId });

    const result = await runHlGenerate(payload.runId);

    metadata.set("step", "completed");
    metadata.set("phase", result.phase);
    metadata.set("segmentsGenerated", result.segmentsGenerated);
    if (result.failureReason) metadata.set("failureReason", result.failureReason);
    await metadata.flush();

    logger.log("Hyperlocal generate finished", {
      runId: payload.runId,
      phase: result.phase,
      segmentsGenerated: result.segmentsGenerated,
    });

    return result;
  },
});
