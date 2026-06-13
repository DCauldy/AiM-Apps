import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  generateTourProjectVideo,
  type GenerateTourProjectVideoInput,
} from "@/lib/tours/rendering/generate-tour-project-video";
import { createElevenLabsVoiceoverProvider } from "@/lib/tours/rendering/tour-voiceover";
import { createOpenRouterScriptPlanningProvider } from "@/lib/tours/rendering/openrouter-script-planning-provider";
import { createOpenRouterTransitionDetectionProvider } from "@/lib/tours/rendering/tour-transitions";
import { createServiceRoleTourRenderRepository } from "@/lib/tours/rendering/tour-render.repository";
import { createHeyGenAvatarProvider } from "@/lib/tours/rendering/tour-avatar";
import { createOpenRouterImageToVideoProvider } from "@/lib/tours/rendering/tour-scene-clips";

export type RenderTourProjectPayload = Omit<GenerateTourProjectVideoInput, "progress">;

export const renderTourProjectTask = task({
  id: "render-tour-project",
  queue: {
    name: "tour-project-renders",
    concurrencyLimit: 1,
  },
  maxDuration: 60 * 60,
  run: async (payload: RenderTourProjectPayload, { ctx }) => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.renderRunId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "queued");
    metadata.set("progressPercent", 0);

    logger.log("Tours render task shell started.", {
      projectId: payload.projectId,
      renderRunId: payload.renderRunId,
      triggerRunId: ctx.run.id,
      renderMode: payload.options?.renderMode ?? "ken_burns_ffmpeg",
      sceneClipProviderModelId: payload.options?.sceneClipProviderModelId ?? null,
      reuseExistingAssets: payload.options?.reuseExistingAssets,
    });

    const isAvatarRender = payload.options?.tourType === "tour_video_avatar";
    const run = await generateTourProjectVideo(
      {
        ...payload,
        progress: (update) => {
          metadata.set("step", update.step);
          metadata.set("label", update.label);
          metadata.set("progressPercent", update.progressPercent);
          metadata.set("message", update.message ?? update.label);
        },
      },
      {
        repository: createServiceRoleTourRenderRepository(),
        scriptPlanningProvider: createOpenRouterScriptPlanningProvider({
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
        }),
        voiceoverProvider: createElevenLabsVoiceoverProvider(),
        transitionDetectionProvider: createOpenRouterTransitionDetectionProvider({
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
        }),
        imageToVideoProvider: createOpenRouterImageToVideoProvider({
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
        }),
        ...(isAvatarRender ? { avatarProvider: createHeyGenAvatarProvider() } : {}),
      }
    );

    metadata.set("status", run?.status ?? "failed");
    if (run?.status === "failed") {
      logger.error("Tours render task finished failed.", {
        projectId: payload.projectId,
        renderRunId: payload.renderRunId,
        triggerRunId: ctx.run.id,
        step: run.currentStep,
        label: run.currentStepLabel,
        errorMessage: run.errorMessage,
      });
    } else {
      logger.log("Tours render task finished.", {
        projectId: payload.projectId,
        renderRunId: payload.renderRunId,
        triggerRunId: ctx.run.id,
        status: run?.status ?? "failed",
        resultAssetId: run?.resultAssetId ?? null,
      });
    }
    await metadata.flush();

    return {
      ok: run?.status === "completed",
      renderRunId: payload.renderRunId,
      status: run?.status ?? "failed",
    };
  },
});
