import { batch, logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  generateTourProjectVideo,
  type GenerateTourProjectVideoInput,
  type TourAvatarBatchItem,
  type TourAvatarBatchResult,
  type TourFinalRenderBatchItem,
  type TourFinalRenderBatchResult,
} from "@/lib/tours/rendering/generation/generate-tour-project-video";
import { safeErrorMessage } from "@/lib/tours/rendering/generation/generate-tour-project-video.helpers";
import { renderFinalVideoStage } from "@/lib/tours/rendering/final-render/final-render";
import { createElevenLabsVoiceoverProvider } from "@/lib/tours/rendering/voiceover/tour-voiceover";
import { createOpenRouterScriptPlanningProvider } from "@/lib/tours/rendering/providers/openrouter-script-planning-provider";
import { createOpenRouterTransitionDetectionProvider } from "@/lib/tours/rendering/transitions/tour-transitions";
import { createServiceRoleTourRenderRepository } from "@/lib/tours/rendering/repositories/tour-render.repository";
import {
  createHeyGenAvatarProvider,
  prepareHeyGenAvatarStage,
} from "@/lib/tours/rendering/avatars/tour-avatar";
import {
  createOpenRouterImageToVideoProvider,
  renderSceneClipBatchItem,
  type SceneClipBatchItem,
  type SceneClipBatchResult,
} from "@/lib/tours/rendering/scenes/scene-clips";
import { cleanupSupersededFreshRenderAssets } from "@/lib/tours/rendering/repositories/tour-render-retention";
import { getDefaultTourRenderMode } from "@/lib/tours/rendering/preflight/preflight";
import { enqueueTourRenderReadyEmailAfterCompletion } from "@/lib/tours/email/render-ready";
import { sendTourRenderReadyEmailTask } from "./tour-render-emails";

export const renderTourSceneClipTask = task({
  id: "render-tour-scene-clip",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    name: "tour-scene-clip-renders",
    concurrencyLimit: 2,
  },
  machine: "small-1x",
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

    const repository = createServiceRoleTourRenderRepository();
    try {
      const clip = await renderSceneClipBatchItem({
        item: payload,
        repository,
        provider: createOpenRouterImageToVideoProvider({
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
        }),
      });

      metadata.set("status", "completed");
      metadata.set("assetId", clip.asset.id);
      await metadata.flush();

      return { index: payload.index, clip };
    } catch (error) {
      const safeMessage = safeErrorMessage(error);
      logger.error("Tours scene clip task failed.", {
        projectId: payload.projectId,
        renderRunId: payload.runId,
        sceneId: payload.scene.id,
        sceneTitle: payload.scene.title,
        error,
        safeMessage,
      });
      await repository.markFailed({
        runId: payload.runId,
        projectId: payload.projectId,
        userId: payload.userId,
        step: "failed",
        label: "Failed",
        safeMessage,
      });
      await repository.appendEvent({
        runId: payload.runId,
        projectId: payload.projectId,
        step: "rendering_scene_clips",
        status: "failed",
        safeMessage,
        metadata: {
          sceneId: payload.scene.id,
          sceneTitle: payload.scene.title,
        },
      });
      metadata.set("status", "failed");
      metadata.set("errorMessage", safeMessage);
      await metadata.flush();
      throw error;
    }
  },
});

export const renderTourAvatarTask = task({
  id: "render-tour-avatar",
  queue: {
    name: "tour-avatar-renders",
    concurrencyLimit: 1,
  },
  machine: "small-1x",
  maxDuration: 45 * 60,
  run: async (payload: TourAvatarBatchItem, { ctx }) => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.runId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "generating_avatar");

    logger.log("Tours avatar task started.", {
      projectId: payload.projectId,
      renderRunId: payload.runId,
      avatarId: payload.options.avatarId ?? null,
      reuseExistingAssets: payload.options.reuseExistingAssets,
    });

    const avatar = await prepareHeyGenAvatarStage({
      projectId: payload.projectId,
      runId: payload.runId,
      userId: payload.userId,
      profileId: payload.profileId,
      source: {
        mode: "generate",
        title: payload.projectName,
        audioUrl: payload.signedVoiceoverAudioUrl,
      },
      repository: createServiceRoleTourRenderRepository(),
      provider: createHeyGenAvatarProvider(),
      voiceoverAudioAsset: payload.voiceoverAudioAsset,
      options: payload.options,
    });

    metadata.set("status", "completed");
    metadata.set("avatarAssetId", avatar.avatarAsset.id);
    metadata.set("metadataAssetId", avatar.metadataAsset.id);
    await metadata.flush();

    return avatar satisfies TourAvatarBatchResult;
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

function getProviderVisibleSupabaseUrlForLog(): string | null {
  const value = process.env.PROVIDER_VISIBLE_SUPABASE_URL?.trim();
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

function getSceneClipMachinePreset(item: SceneClipBatchItem): "small-1x" | "medium-1x" {
  return item.options.renderMode === "ken_burns_ffmpeg" ? "medium-1x" : "small-1x";
}

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

export const renderTourFinalVideoTask = task({
  id: "render-tour-final-video",
  queue: {
    name: "tour-final-video-renders",
    concurrencyLimit: 1,
  },
  machine: "medium-1x",
  retry: { maxAttempts: 1 },
  maxDuration: 30 * 60,
  run: async (
    payload: TourFinalRenderBatchItem,
    { ctx }
  ): Promise<TourFinalRenderBatchResult> => {
    metadata.set("product", "tours");
    metadata.set("projectId", payload.projectId);
    metadata.set("renderRunId", payload.runId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "joining_video");

    logger.log("Tours final video task started.", {
      projectId: payload.projectId,
      renderRunId: payload.runId,
      sceneClipCount: payload.clips.length,
      hasVoiceover: Boolean(payload.voiceoverAsset),
      hasAvatarOverlay: Boolean(payload.avatarOverlay),
      reuseExistingAssets: payload.options.reuseExistingAssets,
    });

    try {
      const result = await renderFinalVideoStage({
        projectId: payload.projectId,
        userId: payload.userId,
        runId: payload.runId,
        repository: createServiceRoleTourRenderRepository(),
        clips: payload.clips,
        voiceoverAsset: payload.voiceoverAsset,
        avatarOverlay: payload.avatarOverlay,
        options: payload.options,
      });

      metadata.set("status", "completed");
      metadata.set("finalVideoAssetId", result.finalVideoAsset.id);
      metadata.set("joinedScenesAssetId", result.joinedScenesAsset?.id ?? "");
      metadata.set("reusedFinalVideo", result.reusedFinalVideo);
      metadata.set("reusedJoinedScenes", result.reusedJoinedScenes);
      await metadata.flush();

      return result;
    } catch (error) {
      const safeMessage = safeErrorMessage(error);
      logger.error("Tours final video task failed.", {
        projectId: payload.projectId,
        renderRunId: payload.runId,
        triggerRunId: ctx.run.id,
        error,
        safeMessage,
      });
      metadata.set("status", "failed");
      metadata.set("errorMessage", safeMessage);
      await metadata.flush();
      throw error;
    }
  },
});

export const renderTourProjectTask = task({
  id: "render-tour-project",
  queue: {
    name: "tour-project-renders",
    concurrencyLimit: 1,
  },
  machine: "small-1x",
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
      renderMode: payload.options?.renderMode ?? getDefaultTourRenderMode(),
      sceneClipProviderModelId:
        payload.options?.sceneClipProviderModelId ?? null,
      sceneClipIncludeSecondarySourceImages:
        payload.options?.sceneClipIncludeSecondarySourceImages ?? true,
      reuseExistingAssets: payload.options?.reuseExistingAssets,
      providerVisibleSupabaseUrl: getProviderVisibleSupabaseUrlForLog(),
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
        mediaBatchRunner: async ({ sceneClipItems, avatarItem }) => {
          const batchItems = [
            ...sceneClipItems.map((item) => ({
              id: renderTourSceneClipTask.id,
              payload: item,
              options: {
                machine: getSceneClipMachinePreset(item),
                tags: [
                  `user:${item.userId}`,
                  `tour-project:${item.projectId}`,
                  `tour-render:${item.runId}`,
                  `tour-scene:${item.scene.id}`,
                  "render-tour-scene-clip",
                ],
              },
            })),
            ...(avatarItem
              ? [
                  {
                    id: renderTourAvatarTask.id,
                    payload: avatarItem,
                    options: {
                      tags: [
                        `user:${avatarItem.userId}`,
                        `tour-project:${avatarItem.projectId}`,
                        `tour-render:${avatarItem.runId}`,
                        "render-tour-avatar",
                      ],
                    },
                  },
                ]
              : []),
          ];

          const mediaBatch = await batch.triggerAndWait<
            typeof renderTourSceneClipTask | typeof renderTourAvatarTask
          >(batchItems);

          const sceneClips: SceneClipBatchResult[] = [];
          let avatar: TourAvatarBatchResult | null = null;

          for (const [resultIndex, run] of mediaBatch.runs.entries()) {
            if (run.ok) {
              if (run.taskIdentifier === renderTourSceneClipTask.id) {
                sceneClips.push(run.output);
                continue;
              }
              if (run.taskIdentifier === renderTourAvatarTask.id) {
                avatar = run.output;
                continue;
              }
            }

            logger.error("Tours media child task failed.", {
              batchId: mediaBatch.id,
              childRunId: run.id,
              taskIdentifier: run.taskIdentifier,
              resultIndex,
              error: run.error,
            });
            throw new Error("A tour media child task failed.");
          }

          return { sceneClips, avatar };
        },
        finalRenderRunner: async (input) => {
          const result = await renderTourFinalVideoTask.triggerAndWait(input, {
            idempotencyKey: `tour-final-video:${input.runId}`,
            concurrencyKey: `tour-project-final-video:${input.projectId}`,
            tags: [
              `user:${input.userId}`,
              `tour-project:${input.projectId}`,
              `tour-render:${input.runId}`,
              "render-tour-final-video",
            ],
            metadata: {
              product: "tours",
              projectId: input.projectId,
              renderRunId: input.runId,
              step: "joining_video",
              progressPercent: 86,
            },
          });

          if (result.ok) {
            return result.output;
          }

          logger.error("Tours final video child task failed.", {
            childRunId: result.id,
            error: result.error,
            projectId: input.projectId,
            renderRunId: input.runId,
          });
          throw new Error("A tour final video child task failed.");
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

    await enqueueTourRenderReadyEmailAfterCompletion({
      run,
      payload: {
        projectId: payload.projectId,
        userId: payload.userId,
        renderRunId: payload.renderRunId,
        resultAssetId: run?.resultAssetId ?? "",
      },
      triggerEmailTask: (emailPayload, options) =>
        sendTourRenderReadyEmailTask.trigger(emailPayload, options),
      logger,
      logContext: {
        parentTriggerRunId: ctx.run.id,
      },
    });

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
