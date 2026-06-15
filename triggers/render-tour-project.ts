import { batch, logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  generateTourProjectVideo,
  type GenerateTourProjectVideoInput,
  type TourAvatarBatchItem,
  type TourAvatarBatchResult,
} from "@/lib/tours/rendering/generate-tour-project-video";
import { createElevenLabsVoiceoverProvider } from "@/lib/tours/rendering/tour-voiceover";
import { createOpenRouterScriptPlanningProvider } from "@/lib/tours/rendering/openrouter-script-planning-provider";
import { createOpenRouterTransitionDetectionProvider } from "@/lib/tours/rendering/tour-transitions";
import { createServiceRoleTourRenderRepository } from "@/lib/tours/rendering/tour-render.repository";
import {
  createHeyGenAvatarProvider,
  prepareHeyGenAvatarStage,
} from "@/lib/tours/rendering/tour-avatar";
import {
  createOpenRouterImageToVideoProvider,
  renderSceneClipBatchItem,
  type SceneClipBatchItem,
  type SceneClipBatchResult,
} from "@/lib/tours/rendering/tour-scene-clips";
import { cleanupSupersededFreshRenderAssets } from "@/lib/tours/rendering/tour-render-retention";
import { getDefaultTourRenderMode } from "@/lib/tours/rendering/tour-render-preflight";

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

export const renderTourAvatarTask = task({
  id: "render-tour-avatar",
  queue: {
    name: "tour-avatar-renders",
    concurrencyLimit: 1,
  },
  machine: "medium-1x",
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
      renderMode: payload.options?.renderMode ?? getDefaultTourRenderMode(),
      sceneClipProviderModelId:
        payload.options?.sceneClipProviderModelId ?? null,
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
