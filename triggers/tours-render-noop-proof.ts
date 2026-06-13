import { logger, metadata, task } from "@trigger.dev/sdk/v3";

export type ToursRenderNoopProofPayload = {
  projectId: string;
  userId: string;
  renderRunId: string;
  options: {
    proofOnly: true;
    renderMode?: "ken_burns_ffmpeg" | "provider_image_to_video";
    reuseExistingAssets?: boolean;
  };
};

export const toursRenderNoopProofTask = task({
  id: "tours-render-noop-proof",
  maxDuration: 60,
  run: async (payload: ToursRenderNoopProofPayload, { ctx }) => {
    const proof = {
      projectId: payload.projectId,
      userId: payload.userId,
      renderRunId: payload.renderRunId,
      options: payload.options,
      triggerRunId: ctx.run.id,
      receivedAt: new Date().toISOString(),
    };

    logger.log("Tours render no-op proof task received payload.", proof);
    metadata.set("toursRenderNoopProof", proof);
    await metadata.flush();

    return {
      ok: true,
      proof,
    };
  },
});
