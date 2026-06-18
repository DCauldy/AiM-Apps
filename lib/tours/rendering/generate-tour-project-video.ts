import { preflightTourRender } from "./tour-render-preflight";
import { resolveProfileIdForRender } from "@/lib/profiles/resolve-for-render";
import {
  createTourRenderRepository,
  type TourRenderAsset,
  type TourRenderRun,
} from "./tour-render.repository";
import {
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  planTourScriptStage,
} from "./tour-script-planning";
import { generateVoiceoverStage } from "./tour-voiceover";
import {
  DEFAULT_TOUR_TRANSITION_DETECTION_MODEL,
  detectTransitionsAndDurationsStage,
  normalizeVoiceoverTranscript,
  TourTransitionDetectionError,
} from "./tour-transitions";
import {
  renderSceneClipsStage,
  type SceneClipBatchRunner,
} from "./tour-scene-clips";
import {
  renderFinalVideoStage,
  type FinalRenderAvatarOverlay,
} from "./tour-final-render";
import { prepareHeyGenAvatarStage } from "./tour-avatar";
import {
  applyScriptPlannedCameraMotions,
  buildAvatarBatchItem,
  isProviderReachableUrl,
  needsAvatar,
  needsVoiceover,
  resolveAvatarOverlay,
  safeErrorMessage,
  scriptTimingsToDurations,
  shouldReuseAsset,
  summarizePreflightFailure,
  summarizeSceneCameraMotions,
} from "./generate-tour-project-video.helpers";
import {
  markShellFailed,
  notifyProgress,
  recordProgress,
} from "./generate-tour-project-video-progress";
import type {
  GenerateTourProjectVideoInput,
  GenerateTourProjectVideoOptions,
  TourAvatarBatchItem,
  TourAvatarBatchResult,
} from "./generate-tour-project-video.types";

export type {
  GenerateTourProjectVideoInput,
  TourAvatarBatchItem,
  TourAvatarBatchResult,
  TourMediaBatchRunner,
  TourRenderProgressUpdate,
} from "./generate-tour-project-video.types";

export async function generateTourProjectVideo(
  input: GenerateTourProjectVideoInput,
  options: GenerateTourProjectVideoOptions = {}
): Promise<TourRenderRun | null> {
  const repository = options.repository ?? (await createTourRenderRepository());
  const preflight = options.preflight ?? preflightTourRender;
  const resolveProfileId = options.resolveProfileId ?? resolveProfileIdForRender;
  const scriptPlanningProvider = options.scriptPlanningProvider;
  const voiceoverProvider = options.voiceoverProvider;
  const transitionDetectionProvider = options.transitionDetectionProvider;

  try {
    const run = await repository.getRenderRun({
      runId: input.renderRunId,
      projectId: input.projectId,
      userId: input.userId,
    });

    if (!run) {
      return markShellFailed(repository, input, "Tour render run was not found.");
    }

    // Resolve which platform_profile's keys this render uses. Preflight
    // also calls this; doing it once at the top lets us pass profileId
    // down to the voiceover + avatar stages without re-querying.
    const profileId = await resolveProfileId(input.projectId, input.userId);
    if (!profileId) {
      return markShellFailed(
        repository,
        input,
        "No platform profile is set up — add one in /apps/profile before rendering."
      );
    }

    const preflightResult = await preflight(
      {
        projectId: input.projectId,
        userId: input.userId,
        options: input.options,
      },
      { repository }
    );

    if (!preflightResult.ok) {
      return markShellFailed(repository, input, summarizePreflightFailure(preflightResult));
    }

    await recordProgress(repository, input, {
      step: "preparing_assets",
      label: "Loading Project",
      progressPercent: 10,
      message: "Loading renderable Tour Project context.",
      metadata: {
        preflightSummary: preflightResult.summary,
      },
    });

    const project = await repository.getRenderableTourProject({
      projectId: input.projectId,
      userId: input.userId,
    });

    if (!project) {
      return markShellFailed(repository, input, "Tour Project render context could not be loaded.");
    }

    await recordProgress(repository, input, {
      step: "preparing_assets",
      label: "Preparing Assets",
      progressPercent: 18,
      message: "Preparing source photos and proofed facts for script planning.",
      metadata: {
        includedSceneCount: project.scenes.filter((scene) => scene.included).length,
      },
    });

    await recordProgress(repository, input, {
      step: "planning_script",
      label: "Checking Script Reuse",
      progressPercent: 25,
      message: "Checking for a reusable script plan asset.",
      metadata: {
        modelId: input.options?.scriptPlanningModelId ?? DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
      },
    });

    if (!scriptPlanningProvider) {
      return markShellFailed(
        repository,
        input,
        "Script planning provider is not configured for this render task."
      );
    }

    const scriptPlanResult = await planTourScriptStage({
      project,
      repository,
      runId: input.renderRunId,
      userId: input.userId,
      provider: scriptPlanningProvider,
      options: {
        modelId: input.options?.scriptPlanningModelId,
        reuseExistingAssets: shouldReuseAsset(input.options, "scriptPlan"),
        fallbackDurationSeconds: input.options?.scriptPlanningFallbackDurationSeconds,
        minDurationSeconds: input.options?.scriptPlanningMinDurationSeconds,
        maxDurationSeconds: input.options?.scriptPlanningMaxDurationSeconds,
      },
    });

    await recordProgress(repository, input, {
      step: "planning_script",
      label: scriptPlanResult.reused ? "Script Plan Reused" : "Script Planned",
      progressPercent: 35,
      message: scriptPlanResult.reused
        ? "A matching reusable script plan asset was selected."
        : "Script plan asset was generated and persisted.",
      metadata: {
        assetId: scriptPlanResult.asset.id,
        fingerprintHash: scriptPlanResult.fingerprintHash,
        reused: scriptPlanResult.reused,
      },
    });

    let voiceoverAssetIds: { audioAssetId: string; transcriptAssetId: string } | null = null;
    let voiceoverAudioAsset: TourRenderAsset | null = null;
    let transitionAssetIds:
      | { transitionsAssetId: string; durationsAssetId: string }
      | null = null;
    let avatarAssetIds:
      | { avatarVideoAssetId: string; avatarMetadataAssetId: string }
      | null = null;
    let avatarOverlay: FinalRenderAvatarOverlay | null = null;
    let avatarBatchItem: TourAvatarBatchItem | null = null;
    let batchedAvatarResult: TourAvatarBatchResult | null = null;
    let avatarProgressResult: TourAvatarBatchResult | null = null;
    let sceneDurations = scriptTimingsToDurations(scriptPlanResult.plan);
    if (needsVoiceover(project.project.tourType)) {
      await recordProgress(repository, input, {
        step: "generating_voiceover",
        label: "Checking Voiceover Reuse",
        progressPercent: 42,
        message: "Checking for reusable ElevenLabs voiceover assets.",
      });

      if (!voiceoverProvider) {
        return markShellFailed(
          repository,
          input,
          "ElevenLabs voiceover provider is not configured for this render task."
        );
      }

      const voiceoverResult = await generateVoiceoverStage({
        projectId: input.projectId,
        runId: input.renderRunId,
        userId: input.userId,
        profileId,
        scriptPlan: scriptPlanResult.plan,
        repository,
        provider: voiceoverProvider,
        getApiKey: options.getApiKey,
        options: {
          reuseExistingAssets: shouldReuseAsset(input.options, "voiceover"),
          voiceId: input.options?.elevenLabsVoiceId,
          modelId: input.options?.elevenLabsModelId,
          voiceSettings: input.options?.elevenLabsVoiceSettings,
          transcript: input.options?.voiceoverTranscriptOptions,
        },
      });

      await recordProgress(repository, input, {
        step: "generating_voiceover",
        label: voiceoverResult.reused ? "Voiceover Reused" : "Voiceover Generated",
        progressPercent: 52,
        message: voiceoverResult.reused
          ? "Matching reusable voiceover audio and transcript assets were selected."
          : "Voiceover audio and transcript assets were generated and persisted.",
        metadata: {
          audioAssetId: voiceoverResult.audioAsset.id,
          transcriptAssetId: voiceoverResult.transcriptAsset.id,
          fingerprintHash: voiceoverResult.fingerprintHash,
          reused: voiceoverResult.reused,
        },
      });

      voiceoverAssetIds = {
        audioAssetId: voiceoverResult.audioAsset.id,
        transcriptAssetId: voiceoverResult.transcriptAsset.id,
      };
      voiceoverAudioAsset = voiceoverResult.audioAsset;

      await recordProgress(repository, input, {
        step: "detecting_transitions",
        label: "Checking Transition Reuse",
        progressPercent: 58,
        message: "Checking for reusable scene transition and duration assets.",
        metadata: {
          modelId:
            input.options?.transitionDetectionModelId ?? DEFAULT_TOUR_TRANSITION_DETECTION_MODEL,
        },
      });

      if (!transitionDetectionProvider) {
        return markShellFailed(
          repository,
          input,
          "Transition detection provider is not configured for this render task."
        );
      }

      let transcript = voiceoverResult.reused ? null : voiceoverResult.transcript;
      if (voiceoverResult.reused) {
        if (
          voiceoverResult.transcriptAsset.storageBucket !== "tours-generated-media" ||
          !voiceoverResult.transcriptAsset.storagePath
        ) {
          throw new TourTransitionDetectionError(
            "Stored voiceover transcript asset is missing a storage object.",
            "TRANSCRIPT_INVALID"
          );
        }

        transcript = normalizeVoiceoverTranscript(
          await repository.downloadRenderAssetJson({
            storageBucket: voiceoverResult.transcriptAsset.storageBucket,
            storagePath: voiceoverResult.transcriptAsset.storagePath,
          })
        );
      }
      if (!transcript) {
        throw new TourTransitionDetectionError(
          "Voiceover transcript is required for scene transition detection.",
          "TRANSCRIPT_INVALID"
        );
      }

      const transitionsResult = await detectTransitionsAndDurationsStage({
        project,
        repository,
        runId: input.renderRunId,
        userId: input.userId,
        transcript,
        provider: transitionDetectionProvider,
        options: {
          modelId: input.options?.transitionDetectionModelId,
          reuseExistingAssets: shouldReuseAsset(input.options, "voiceover"),
          minDurationSeconds: input.options?.transitionMinimumDurationSeconds,
          roundingIncrementSeconds: input.options?.transitionDurationRoundingIncrementSeconds,
        },
      });

      await recordProgress(repository, input, {
        step: "detecting_transitions",
        label: transitionsResult.reused ? "Transitions Reused" : "Transitions Detected",
        progressPercent: 64,
        message: transitionsResult.reused
          ? "Matching reusable transition and duration assets were selected."
          : "Scene transitions and durations were generated and persisted.",
        metadata: {
          transitionsAssetId: transitionsResult.transitionsAsset.id,
          durationsAssetId: transitionsResult.durationsAsset.id,
          transitionFingerprintHash: transitionsResult.transitionFingerprintHash,
          durationFingerprintHash: transitionsResult.durationFingerprintHash,
          reused: transitionsResult.reused,
        },
      });

      transitionAssetIds = {
        transitionsAssetId: transitionsResult.transitionsAsset.id,
        durationsAssetId: transitionsResult.durationsAsset.id,
      };
      sceneDurations = transitionsResult.durations;
    }

    if (needsAvatar(project.project.tourType)) {
      if (!voiceoverAudioAsset) {
        return markShellFailed(
          repository,
          input,
          "Avatar rendering requires generated voiceover audio."
        );
      }
      if (
        voiceoverAudioAsset.storageBucket !== "tours-generated-media" ||
        !voiceoverAudioAsset.storagePath
      ) {
        return markShellFailed(
          repository,
          input,
          "Voiceover audio could not be loaded for avatar rendering."
        );
      }

      const signedVoiceoverAudio = await repository.createSignedGeneratedMediaUrl({
        storageBucket: voiceoverAudioAsset.storageBucket,
        storagePath: voiceoverAudioAsset.storagePath,
        expiresInSeconds: 60 * 60 * 4,
      });
      if (!signedVoiceoverAudio) {
        return markShellFailed(
          repository,
          input,
          "Voiceover audio could not be signed for avatar rendering."
        );
      }
      if (!isProviderReachableUrl(signedVoiceoverAudio.signedUrl)) {
        return markShellFailed(
          repository,
          input,
          "Voiceover audio is not reachable by HeyGen. Set PROVIDER_VISIBLE_SUPABASE_URL for local avatar renders."
        );
      }

      await recordProgress(repository, input, {
        step: "generating_avatar",
        label: "Checking Avatar Reuse",
        progressPercent: 66,
        message: "Checking for a reusable HeyGen avatar overlay.",
      });

      avatarBatchItem = buildAvatarBatchItem({
        projectId: input.projectId,
        runId: input.renderRunId,
        userId: input.userId,
        profileId,
        projectName: project.project.name,
        signedVoiceoverAudioUrl: signedVoiceoverAudio.signedUrl,
        voiceoverAudioAsset,
        options: input.options,
      });

      if (!options.mediaBatchRunner) {
        const avatarResult = await prepareHeyGenAvatarStage({
          projectId: avatarBatchItem.projectId,
          runId: avatarBatchItem.runId,
          userId: avatarBatchItem.userId,
          profileId: avatarBatchItem.profileId,
          source: {
            mode: "generate",
            title: avatarBatchItem.projectName,
            audioUrl: avatarBatchItem.signedVoiceoverAudioUrl,
          },
          repository,
          provider: options.avatarProvider,
          voiceoverAudioAsset: avatarBatchItem.voiceoverAudioAsset,
          getApiKey: options.getApiKey,
          options: avatarBatchItem.options,
        });

        const resolvedAvatar = resolveAvatarOverlay(avatarResult);
        if (!resolvedAvatar) {
          return markShellFailed(
            repository,
            input,
            "Stored avatar metadata could not be loaded for final compositing."
          );
        }

        avatarAssetIds = resolvedAvatar.avatarAssetIds;
        avatarOverlay = resolvedAvatar.avatarOverlay;

        await recordProgress(repository, input, {
          step: "generating_avatar",
          label: avatarResult.reused ? "Avatar Reused" : "Avatar Generated",
          progressPercent: 67,
          message: avatarResult.reused
            ? "A matching reusable avatar overlay was selected."
            : "Avatar video and compositing metadata were generated and persisted.",
          metadata: {
            ...avatarAssetIds,
            fingerprintHash: avatarResult.fingerprintHash,
            reused: avatarResult.reused,
          },
        });
      }
    }

    const renderableProject = applyScriptPlannedCameraMotions(project, scriptPlanResult.plan);
    const finalSceneCameraMotions = summarizeSceneCameraMotions(renderableProject);
    console.log("Tour render scene camera motions resolved.", {
      projectId: input.projectId,
      runId: input.renderRunId,
      sceneCameraMotions: finalSceneCameraMotions,
    });

    await recordProgress(repository, input, {
      step: "rendering_scene_clips",
      label: "Checking Scene Clip Reuse",
      progressPercent: 68,
      sceneClipCompletedCount: 0,
      sceneClipTotalCount: renderableProject.scenes.filter((scene) => scene.included).length,
      message: "Checking reusable scene clips before rendering missing clips.",
      metadata: {
        renderMode: input.options?.renderMode ?? preflightResult.summary.renderMode,
        sceneCameraMotions: finalSceneCameraMotions,
      },
    });

    const sceneClipBatchRunner: SceneClipBatchRunner | undefined = options.mediaBatchRunner
      ? async (items) => {
          const result = await options.mediaBatchRunner?.({
            sceneClipItems: items,
            avatarItem: avatarBatchItem,
          });
          if (!result) {
            throw new Error("Tour media batch runner did not return a result.");
          }
          batchedAvatarResult = result.avatar;
          return result.sceneClips;
        }
      : options.sceneClipBatchRunner;

    const sceneClipResult = await renderSceneClipsStage({
      project: renderableProject,
      repository,
      runId: input.renderRunId,
      userId: input.userId,
      durations: sceneDurations,
      renderer: options.sceneClipRenderer,
      provider: options.imageToVideoProvider,
      batchRunner: sceneClipBatchRunner,
      options: {
        renderMode: input.options?.renderMode ?? preflightResult.summary.renderMode,
        reuseExistingAssets: shouldReuseAsset(input.options, "sceneClips"),
        providerModelId: input.options?.sceneClipProviderModelId,
        includeSecondarySourceImages: input.options?.sceneClipIncludeSecondarySourceImages,
        renderSettings: input.options?.sceneClipRenderSettings,
        concurrencyLimit: input.options?.sceneClipConcurrencyLimit,
        sceneTransitions: input.options?.sceneTransitions,
      },
      onClipCompleted: async ({ completedCount, totalCount }) => {
        await recordProgress(repository, input, {
          step: "rendering_scene_clips",
          label: "Rendering Scene Clips",
          progressPercent: Math.min(82, 68 + Math.round((completedCount / totalCount) * 14)),
          sceneClipCompletedCount: completedCount,
          sceneClipTotalCount: totalCount,
          message: `Rendered ${completedCount} of ${totalCount} scene clips.`,
        });
      },
    });

    if (avatarBatchItem && options.mediaBatchRunner) {
      const avatarResult = batchedAvatarResult as TourAvatarBatchResult | null;
      if (!avatarResult) {
        return markShellFailed(repository, input, "Avatar rendering did not return a result.");
      }

      const resolvedAvatar = resolveAvatarOverlay(avatarResult);
      if (!resolvedAvatar) {
        return markShellFailed(
          repository,
          input,
          "Stored avatar metadata could not be loaded for final compositing."
        );
      }

      avatarAssetIds = resolvedAvatar.avatarAssetIds;
      avatarOverlay = resolvedAvatar.avatarOverlay;
      avatarProgressResult = avatarResult;
    }

    await recordProgress(repository, input, {
      step: "rendering_scene_clips",
      label: "Scene Clips Ready",
      progressPercent: 82,
      sceneClipCompletedCount: sceneClipResult.completedCount,
      sceneClipTotalCount: sceneClipResult.totalCount,
      message: "Scene clips were rendered or reused and persisted.",
      metadata: {
        sceneClipAssetIds: sceneClipResult.clips.map((clip) => clip.asset.id),
        reusedCount: sceneClipResult.clips.filter((clip) => clip.reused).length,
        sceneCameraMotions: finalSceneCameraMotions,
      },
    });

    if (avatarProgressResult && avatarAssetIds) {
      await repository.appendEvent({
        runId: input.renderRunId,
        projectId: input.projectId,
        step: "generating_avatar",
        status: "running",
        safeMessage: avatarProgressResult.reused
          ? "A matching reusable avatar overlay was selected."
          : "Avatar video and compositing metadata were generated and persisted.",
        metadata: {
          ...avatarAssetIds,
          fingerprintHash: avatarProgressResult.fingerprintHash,
          reused: avatarProgressResult.reused,
        },
      });
    }

    await recordProgress(repository, input, {
      step: "joining_video",
      label: "Joining Scene Clips",
      progressPercent: 86,
      sceneClipCompletedCount: sceneClipResult.completedCount,
      sceneClipTotalCount: sceneClipResult.totalCount,
      message: "Joining ordered scene clips for the final render.",
      metadata: {
        preflightSummary: preflightResult.summary,
        scriptPlanAssetId: scriptPlanResult.asset.id,
        ...(voiceoverAssetIds ?? {}),
        ...(transitionAssetIds ?? {}),
        ...(avatarAssetIds ?? {}),
        sceneClipAssetIds: sceneClipResult.clips.map((clip) => clip.asset.id),
      },
    });

    const finalRenderResult = await renderFinalVideoStage({
      projectId: input.projectId,
      userId: input.userId,
      runId: input.renderRunId,
      repository,
      clips: sceneClipResult.clips.map((clip) => ({
        sceneId: clip.sceneId,
        durationSeconds: clip.durationSeconds,
        requestedDurationSeconds: clip.requestedDurationSeconds,
        handlePlan: clip.handlePlan,
        asset: clip.asset,
        fingerprintHash: clip.fingerprintHash,
      })),
      voiceoverAsset: voiceoverAudioAsset,
      avatarOverlay,
      renderer: options.finalVideoRenderer,
      options: {
        muxSettings: input.options?.finalMuxSettings,
        reuseExistingAssets: shouldReuseAsset(input.options, "finalVideo"),
        sceneTransitions: input.options?.sceneTransitions,
      },
    });

    await recordProgress(repository, input, {
      step: "uploading_final",
      label: "Uploading Final Video",
      progressPercent: 96,
      sceneClipCompletedCount: sceneClipResult.completedCount,
      sceneClipTotalCount: sceneClipResult.totalCount,
      message: "Final video was uploaded and persisted.",
      metadata: {
        joinedScenesAssetId: finalRenderResult.joinedScenesAsset?.id ?? null,
        finalVideoAssetId: finalRenderResult.finalVideoAsset.id,
        joinedScenesFingerprintHash: finalRenderResult.joinedScenesFingerprintHash,
        finalVideoFingerprintHash: finalRenderResult.finalVideoFingerprintHash,
        reusedFinalVideo: finalRenderResult.reusedFinalVideo,
        reusedJoinedScenes: finalRenderResult.reusedJoinedScenes,
      },
    });

    const completed = await repository.markCompleted({
      runId: input.renderRunId,
      projectId: input.projectId,
      userId: input.userId,
      resultAssetId: finalRenderResult.finalVideoAsset.id,
    });

    if (!completed) {
      return markShellFailed(
        repository,
        input,
        "Final video was saved, but the render run could not be completed."
      );
    }

    await repository.appendEvent({
      runId: input.renderRunId,
      projectId: input.projectId,
      step: "completed",
      status: "completed",
      safeMessage: "Tour render completed.",
      metadata: {
        finalVideoAssetId: finalRenderResult.finalVideoAsset.id,
      },
    });

    await notifyProgress(input, {
      step: "completed",
      label: "Completed",
      progressPercent: 100,
      sceneClipCompletedCount: sceneClipResult.completedCount,
      sceneClipTotalCount: sceneClipResult.totalCount,
      message: "Tour render completed.",
    });

    return completed;
  } catch (error) {
    console.error("Tour render failed with internal error.", {
      projectId: input.projectId,
      renderRunId: input.renderRunId,
      safeMessage: safeErrorMessage(error),
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : null,
      stack: error instanceof Error ? error.stack : null,
    });
    return markShellFailed(repository, input, safeErrorMessage(error));
  }
}
