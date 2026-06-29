import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  runCmaDelivery,
  type RunCmaDeliveryInput,
  type RunCmaDeliveryResult,
} from "@/lib/listing-studio/cma/deliver";

// ============================================================
// CMA delivery — one client, one CMA sent end-to-end.
//
// Thin Trigger.dev shell over runCmaDelivery: sets observability
// metadata (matches Josh's Tours pattern) and delegates the work.
//
// Concurrency cap of 3 protects RapidAPI quota under burst (e.g.
// cadence-tick fanning out 100 deliveries at once). Retries are off
// because runCmaPipeline persists pipeline_error on the ls_cma_runs
// row and the delivery row stores send_error — an automatic retry
// would mask the real failure AND burn another RapidAPI credit.
//
// maxDuration: 5 min covers a worst-case pipeline (90s RapidAPI +
// 2x Claude calls + render + ESP send) with headroom.
// ============================================================

export const cmaDeliverTask = task({
  id: "cma-deliver",
  queue: {
    name: "cma-deliveries",
    concurrencyLimit: 3,
  },
  machine: "small-2x",
  retry: { maxAttempts: 1 },
  maxDuration: 5 * 60,
  run: async (
    payload: RunCmaDeliveryInput,
    { ctx },
  ): Promise<RunCmaDeliveryResult> => {
    metadata.set("product", "listing-studio");
    metadata.set("clientId", payload.clientId);
    metadata.set("triggerSource", payload.triggerSource);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "running");

    logger.log("CMA delivery starting", {
      clientId: payload.clientId,
      triggerSource: payload.triggerSource,
      emailConnectionId: payload.emailConnectionId ?? null,
    });

    const result = await runCmaDelivery(payload);

    metadata.set("status", result.success ? "delivered" : "send_failed");
    metadata.set("deliveryId", result.deliveryId);
    metadata.set("cmaRunId", result.cmaRunId);
    if (result.providerMessageId) {
      metadata.set("providerMessageId", result.providerMessageId);
    }
    await metadata.flush();

    if (!result.success) {
      logger.error("CMA delivery ESP send failed", {
        clientId: payload.clientId,
        deliveryId: result.deliveryId,
        cmaRunId: result.cmaRunId,
      });
    } else {
      logger.log("CMA delivery sent", {
        clientId: payload.clientId,
        deliveryId: result.deliveryId,
        cmaRunId: result.cmaRunId,
        providerMessageId: result.providerMessageId,
      });
    }

    return result;
  },
});
