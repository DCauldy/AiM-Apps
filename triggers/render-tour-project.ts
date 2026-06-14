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
import {
  createOpenRouterImageToVideoProvider,
  renderSceneClipBatchItem,
  type SceneClipBatchItem,
} from "@/lib/tours/rendering/tour-scene-clips";
import { cleanupSupersededFreshRenderAssets } from "@/lib/tours/rendering/tour-render-retention";

export const renderTourSceneClipTask = task({
  id: "render-tour-scene-clip",
  queue: {
    name: "tour-scene-clip-renders",
    concurrencyLimit: 2,
  },
  machine: "medium-1x",
  maxDuration: 30 * 60,
  run: async (payload: SceneClipBatchItem, { ctx }) => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.runId);
    metadata.set("sceneId", payload.scene.id);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "rendering_scene_clip");

    logger.log("Tours scene clip task started.", {
      projectId: payload.projectId,
      renderRunId: payload.runId,
      sceneId: payload.scene.id,
      sceneTitle: payload.scene.title,
      renderMode: payload.options.renderMode,
      reuseExistingAssets: payload.options.reuseExistingAssets,
    });

    const clip = await renderSceneClipBatchItem({
      item: payload,
      repository: createServiceRoleTourRenderRepository(),
      provider: createOpenRouterImageToVideoProvider({
        apiKey: process.env.OPENROUTER_API_KEY ?? "",
      }),
    });

    metadata.set("status", "completed");
    metadata.set("assetId", clip.asset.id);
    await metadata.flush();

    return { index: payload.index, clip };
  },
});

export type RenderTourProjectPayload = Omit<
  GenerateTourProjectVideoInput,
  "progress"
>;

export type CleanupSupersededFreshRenderPayload = {
  projectId: string;
  userId: string;
  renderRunId: string;
};

export const cleanupSupersededFreshRenderAssetsTask = task({
  id: "cleanup-superseded-fresh-render-assets",
  queue: {
    name: "tour-render-asset-cleanup",
    concurrencyLimit: 1,
  },
  machine: "small-1x",
  maxDuration: 10 * 60,
  run: async (payload: CleanupSupersededFreshRenderPayload, { ctx }) => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.renderRunId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "cleanup_superseded_assets");

    logger.log("Tours fresh render asset cleanup started.", payload);

    const result = await cleanupSupersededFreshRenderAssets({
      projectId: payload.projectId,
      userId: payload.userId,
      runId: payload.renderRunId,
    });

    metadata.set("status", result.ok ? "completed" : "failed");
    metadata.set("scanned", result.scanned);
    metadata.set("storageDeleted", result.storageDeleted);
    metadata.set("softDeleted", result.softDeleted);
    metadata.set("skipped", result.skipped);
    metadata.set("failed", result.failed);
    metadata.set("skippedReason", result.skippedReason ?? "");
    await metadata.flush();

    logger.log("Tours fresh render asset cleanup finished.", result);
    return result;
  },
});

export const renderTourProjectTask = task({
  id: "render-tour-project",
  queue: {
    name: "tour-project-renders",
    concurrencyLimit: 1,
  },
  machine: "medium-2x",
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
      sceneClipProviderModelId:
        payload.options?.sceneClipProviderModelId ?? null,
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
        transitionDetectionProvider:
          createOpenRouterTransitionDetectionProvider({
            apiKey: process.env.OPENROUTER_API_KEY ?? "",
          }),
        imageToVideoProvider: createOpenRouterImageToVideoProvider({
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
        }),
        sceneClipBatchRunner: async (items) => {
          const batch = await renderTourSceneClipTask.batchTriggerAndWait(
            items.map((item) => ({
              payload: item,
              options: {
                tags: [
                  `user:${item.userId}`,
                  `tour-project:${item.projectId}`,
                  `tour-render:${item.runId}`,
                  `tour-scene:${item.scene.id}`,
                  "render-tour-scene-clip",
                ],
              },
            })),
          );

          return batch.runs.map((run, resultIndex) => {
            if (run.ok) {
              return run.output;
            }

            logger.error("Tours scene clip child task failed.", {
              batchId: batch.id,
              childRunId: run.id,
              resultIndex,
              error: run.error,
            });
            throw new Error("A scene clip child task failed.");
          });
        },
        ...(isAvatarRender
          ? { avatarProvider: createHeyGenAvatarProvider() }
          : {}),
      },
    );

    metadata.set("status", run?.status ?? "failed");
    if (run?.status === "completed" && run.resultAssetId && payload.options?.reuseExistingAssets === false) {
      try {
        await cleanupSupersededFreshRenderAssetsTask.trigger(
          {
            projectId: payload.projectId,
            userId: payload.userId,
            renderRunId: payload.renderRunId,
          },
          {
            idempotencyKey: `tour-render-cleanup:${payload.renderRunId}`,
            concurrencyKey: `tour-project-cleanup:${payload.projectId}`,
            tags: [
              `user:${payload.userId}`,
              `tour-project:${payload.projectId}`,
              `tour-render:${payload.renderRunId}`,
              "cleanup-superseded-fresh-render-assets",
            ],
          }
        );
      } catch (error) {
        logger.error("Tours fresh render asset cleanup enqueue failed.", {
          projectId: payload.projectId,
          renderRunId: payload.renderRunId,
          triggerRunId: ctx.run.id,
          error,
        });
      }
    }

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
