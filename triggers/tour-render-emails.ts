import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  sendTourRenderReadyEmailForCompletedRun,
  type TourRenderReadyEmailPayload,
} from "@/lib/tours/email/render-ready";

export const sendTourRenderReadyEmailTask = task({
  id: "send-tour-render-ready-email",
  queue: {
    name: "tour-render-ready-emails",
    concurrencyLimit: 2,
  },
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
  },
  machine: "small-1x",
  maxDuration: 5 * 60,
  run: async (payload: TourRenderReadyEmailPayload, { ctx }) => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.renderRunId);
    metadata.set("resultAssetId", payload.resultAssetId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "send_render_ready_email");

    logger.log("Tours render-ready email task started.", {
      projectId: payload.projectId,
      renderRunId: payload.renderRunId,
      userId: payload.userId,
    });

    const result = await sendTourRenderReadyEmailForCompletedRun(payload);

    metadata.set("status", result.sent ? "sent" : "skipped");
    metadata.set("skippedReason", result.sent ? "" : result.skippedReason);
    await metadata.flush();

    if (result.sent) {
      logger.log("Tours render-ready email sent.", {
        projectId: payload.projectId,
        renderRunId: payload.renderRunId,
        userId: payload.userId,
      });
    } else {
      logger.log("Tours render-ready email skipped.", {
        projectId: payload.projectId,
        renderRunId: payload.renderRunId,
        userId: payload.userId,
        skippedReason: result.skippedReason,
      });
    }

    return result;
  },
});
