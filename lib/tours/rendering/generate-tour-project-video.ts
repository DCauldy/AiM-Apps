import {
  preflightTourRender,
  type TourRenderOptions,
  type TourRenderPreflightIssue,
  type TourRenderPreflightResult,
} from "./tour-render-preflight";
import {
  createTourRenderRepository,
  type TourRenderAsset,
  type TourRenderRepository,
  type TourRenderRun,
  type TourRenderStep,
} from "./tour-render.repository";
import {
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  planTourScriptStage,
  TourScriptPlanningError,
  type TourScriptPlanningProvider,
} from "./tour-script-planning";
import { getProfileApiKey } from "@/lib/user-api-keys/service";
import { resolveProfileIdForRender } from "@/lib/profiles/resolve-for-render";
import {
  generateVoiceoverStage,
  TourVoiceoverError,
  type VoiceoverProvider,
} from "./tour-voiceover";
import {
  DEFAULT_TOUR_TRANSITION_DETECTION_MODEL,
  detectTransitionsAndDurationsStage,
  normalizeVoiceoverTranscript,
  type SceneDuration,
  TourTransitionDetectionError,
  type TransitionDetectionProvider,
} from "./tour-transitions";
import {
  renderSceneClipsStage,
  TourSceneClipRenderError,
  type ImageToVideoProvider,
  type SceneClipBatchRunner,
  type SceneClipRenderer,
} from "./tour-scene-clips";
import {
  renderFinalVideoStage,
  TourFinalRenderError,
  type FinalRenderAvatarOverlay,
  type FinalVideoRenderer,
} from "./tour-final-render";
import {
  prepareHeyGenAvatarStage,
  TourAvatarError,
  type HeyGenAvatarProvider,
} from "./tour-avatar";

export type TourRenderProgressUpdate = {
  step: TourRenderStep;
  label: string;
  progressPercent: number;
  sceneClipCompletedCount?: number;
  sceneClipTotalCount?: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type GenerateTourProjectVideoInput = {
  projectId: string;
  userId: string;
  renderRunId: string;
  options?: TourRenderOptions;
  progress?: (update: TourRenderProgressUpdate) => Promise<void> | void;
};

type GenerateTourProjectVideoOptions = {
  repository?: TourRenderRepository;
  preflight?: typeof preflightTourRender;
  scriptPlanningProvider?: TourScriptPlanningProvider;
  voiceoverProvider?: VoiceoverProvider;
  transitionDetectionProvider?: TransitionDetectionProvider;
  sceneClipRenderer?: SceneClipRenderer;
  sceneClipBatchRunner?: SceneClipBatchRunner;
  finalVideoRenderer?: FinalVideoRenderer;
  imageToVideoProvider?: ImageToVideoProvider;
  avatarProvider?: HeyGenAvatarProvider;
  getApiKey?: typeof getProfileApiKey;
  /** Override the project→profile_id resolver in tests. */
  resolveProfileId?: typeof resolveProfileIdForRender;
};

function safeErrorMessage(_error: unknown): string {
  if (_error instanceof TourScriptPlanningError) {
    if (_error.code === "PROVIDER_RESPONSE_INVALID") {
      return _error.message;
    }
    if (_error.code === "SIGNED_IMAGE_URL_MISSING") {
      return "Source photo URLs could not be signed for script planning.";
    }
    if (_error.code === "SCRIPT_PLAN_UPLOAD_FAILED") {
      return "Script plan upload failed.";
    }
    if (_error.code === "SCRIPT_PLAN_ASSET_CREATE_FAILED") {
      return "Script plan asset could not be recorded.";
    }
    return "Script planning failed.";
  }
  if (_error instanceof TourTransitionDetectionError) {
    if (_error.code === "PROVIDER_RESPONSE_INVALID") {
      return "Scene transition detection returned an invalid response.";
    }
    if (_error.code === "TRANSITION_TIMING_INVALID" || _error.code === "TRANSCRIPT_INVALID") {
      return "Scene transition timing could not be validated.";
    }
  }
  if (_error instanceof TourVoiceoverError) {
    if (_error.code === "MISSING_ELEVENLABS_API_KEY") {
      return "ElevenLabs API key is not configured for voiceover generation.";
    }
    if (_error.code === "MISSING_ELEVENLABS_VOICE_ID") {
      return "ElevenLabs voice id is not configured for voiceover generation.";
    }
    if (_error.code === "ELEVENLABS_TTS_FAILED") {
      return "ElevenLabs voiceover generation failed.";
    }
    if (_error.code === "ELEVENLABS_TTS_RESPONSE_INVALID") {
      return "ElevenLabs voiceover response was invalid.";
    }
    if (
      _error.code === "VOICEOVER_AUDIO_UPLOAD_FAILED" ||
      _error.code === "VOICEOVER_TRANSCRIPT_UPLOAD_FAILED" ||
      _error.code === "VOICEOVER_AUDIO_ASSET_CREATE_FAILED" ||
      _error.code === "VOICEOVER_TRANSCRIPT_ASSET_CREATE_FAILED"
    ) {
      return "Voiceover assets could not be persisted.";
    }
    if (_error.code === "TRANSCRIPT_ALIGNMENT_FAILED") {
      return "Voiceover transcript timing could not be aligned.";
    }
    return "Voiceover generation failed.";
  }
  if (_error instanceof TourSceneClipRenderError) {
    if (_error.code === "SCENE_CLIP_UPLOAD_FAILED") {
      return "Scene clip upload failed.";
    }
    if (_error.code === "SCENE_CLIP_ASSET_CREATE_FAILED") {
      return "Scene clip asset could not be recorded.";
    }
    return "Scene clip rendering failed.";
  }
  if (_error instanceof TourFinalRenderError) {
    if (_error.code === "CONCAT_FAILED") {
      return "Scene clips could not be joined.";
    }
    if (_error.code === "MUX_FAILED") {
      return "Final video mux failed.";
    }
    if (_error.code === "JOINED_SCENES_UPLOAD_FAILED") {
      return "Joined scene video upload failed.";
    }
    if (_error.code === "FINAL_VIDEO_UPLOAD_FAILED") {
      return "Final video upload failed.";
    }
    if (_error.code === "JOINED_SCENES_ASSET_CREATE_FAILED") {
      return "Joined scene video asset could not be recorded.";
    }
    if (_error.code === "FINAL_VIDEO_ASSET_CREATE_FAILED") {
      return "Final video asset could not be recorded.";
    }
    return "Final video rendering failed.";
  }
  if (_error instanceof TourAvatarError) {
    if (_error.code === "MISSING_HEYGEN_API_KEY") {
      return "HeyGen API key is not configured for avatar rendering.";
    }
    if (_error.code === "MISSING_HEYGEN_AVATAR_ID") {
      return "HeyGen avatar id is not configured for avatar rendering.";
    }
    if (
      _error.code === "AVATAR_VIDEO_UPLOAD_FAILED" ||
      _error.code === "AVATAR_METADATA_UPLOAD_FAILED" ||
      _error.code === "AVATAR_VIDEO_ASSET_CREATE_FAILED" ||
      _error.code === "AVATAR_METADATA_ASSET_CREATE_FAILED"
    ) {
      return "Avatar render assets could not be persisted.";
    }
    return "Avatar rendering failed.";
  }

  return "Tour render failed before rendering could complete.";
}

function summarizePreflightFailure(preflight: Extract<TourRenderPreflightResult, { ok: false }>): string {
  const firstIssue: TourRenderPreflightIssue | undefined = preflight.issues[0];
  return firstIssue?.message ?? "Tour project is not ready for rendering.";
}

function needsVoiceover(tourType: string): boolean {
  return tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
}

function needsAvatar(tourType: string): boolean {
  return tourType === "tour_video_avatar";
}

function shouldReuseAsset(
  options: TourRenderOptions | undefined,
  asset: "scriptPlan" | "voiceover" | "avatar" | "sceneClips" | "finalVideo"
): boolean {
  if (typeof options?.reuse?.[asset] === "boolean") {
    return options.reuse[asset];
  }
  return options?.reuseExistingAssets !== false;
}

function scriptTimingsToDurations(scriptPlan: {
  sceneTimings: Array<{ sceneId: string; scriptText: string; durationSeconds: number }>;
}): SceneDuration[] {
  let offsetMs = 0;
  return scriptPlan.sceneTimings.map((timing) => {
    const durationMs = Math.max(0, Math.round(timing.durationSeconds * 1000));
    const duration: SceneDuration = {
      sceneId: timing.sceneId,
      title: timing.sceneId,
      durationSeconds: timing.durationSeconds,
      offsets: {
        from: offsetMs,
        to: offsetMs + durationMs,
      },
    };
    offsetMs += durationMs;
    return duration;
  });
}

async function notifyProgress(
  input: GenerateTourProjectVideoInput,
  update: TourRenderProgressUpdate
): Promise<void> {
  try {
    await input.progress?.(update);
  } catch {
    // Trigger.dev metadata is operational only; Supabase remains the product state.
  }
}

async function recordProgress(
  repository: TourRenderRepository,
  input: GenerateTourProjectVideoInput,
  update: TourRenderProgressUpdate
): Promise<TourRenderRun | null> {
  const run = await repository.updateProgress({
    runId: input.renderRunId,
    projectId: input.projectId,
    userId: input.userId,
    step: update.step,
    label: update.label,
    progressPercent: update.progressPercent,
    sceneClipCompletedCount: update.sceneClipCompletedCount,
    sceneClipTotalCount: update.sceneClipTotalCount,
  });

  await repository.appendEvent({
    runId: input.renderRunId,
    projectId: input.projectId,
    step: update.step,
    status: "running",
    safeMessage: update.message ?? update.label,
    metadata: update.metadata,
  });

  await notifyProgress(input, update);
  return run;
}

async function markShellFailed(
  repository: TourRenderRepository,
  input: GenerateTourProjectVideoInput,
  safeMessage: string
): Promise<TourRenderRun | null> {
  const failed = await repository.markFailed({
    runId: input.renderRunId,
    projectId: input.projectId,
    userId: input.userId,
    step: "failed",
    label: "Failed",
    safeMessage,
  });

  await repository.appendEvent({
    runId: input.renderRunId,
    projectId: input.projectId,
    step: "failed",
    status: "failed",
    safeMessage,
  });

  await notifyProgress(input, {
    step: "failed",
    label: "Failed",
    progressPercent: failed?.progressPercent ?? 0,
    message: safeMessage,
  });

  return failed;
}

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

      await recordProgress(repository, input, {
        step: "generating_avatar",
        label: "Checking Avatar Reuse",
        progressPercent: 66,
        message: "Checking for a reusable HeyGen avatar overlay.",
      });

      const avatarResult = await prepareHeyGenAvatarStage({
        projectId: input.projectId,
        runId: input.renderRunId,
        userId: input.userId,
        profileId,
        source: {
          mode: "generate",
          title: project.project.name,
          audioUrl: signedVoiceoverAudio.signedUrl,
        },
        repository,
        provider: options.avatarProvider,
        voiceoverAudioAsset,
        getApiKey: options.getApiKey,
        options: {
          reuseExistingAssets: shouldReuseAsset(input.options, "avatar"),
          avatarId: input.options?.heyGenAvatarId,
          size: input.options?.heyGenAvatarSize,
          positioning: input.options?.heyGenAvatarPositioning,
          generation: input.options?.heyGenAvatarGeneration,
        },
      });

      if (!avatarResult.metadata) {
        return markShellFailed(
          repository,
          input,
          "Stored avatar metadata could not be loaded for final compositing."
        );
      }

      avatarAssetIds = {
        avatarVideoAssetId: avatarResult.avatarAsset.id,
        avatarMetadataAssetId: avatarResult.metadataAsset.id,
      };
      avatarOverlay = {
        avatarAsset: avatarResult.avatarAsset,
        metadataAsset: avatarResult.metadataAsset,
        metadata: avatarResult.metadata,
      };

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

    await recordProgress(repository, input, {
      step: "rendering_scene_clips",
      label: "Checking Scene Clip Reuse",
      progressPercent: 68,
      sceneClipCompletedCount: 0,
      sceneClipTotalCount: project.scenes.filter((scene) => scene.included).length,
      message: "Checking reusable scene clips before rendering missing clips.",
      metadata: {
        renderMode: input.options?.renderMode ?? preflightResult.summary.renderMode,
      },
    });

    const sceneClipResult = await renderSceneClipsStage({
      project,
      repository,
      runId: input.renderRunId,
      userId: input.userId,
      durations: sceneDurations,
      renderer: options.sceneClipRenderer,
      provider: options.imageToVideoProvider,
      batchRunner: options.sceneClipBatchRunner,
      options: {
        renderMode: input.options?.renderMode ?? preflightResult.summary.renderMode,
        reuseExistingAssets: shouldReuseAsset(input.options, "sceneClips"),
        providerModelId: input.options?.sceneClipProviderModelId,
        renderSettings: input.options?.sceneClipRenderSettings,
        concurrencyLimit: input.options?.sceneClipConcurrencyLimit,
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
      },
    });

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
        asset: clip.asset,
        fingerprintHash: clip.fingerprintHash,
      })),
      voiceoverAsset: voiceoverAudioAsset,
      avatarOverlay,
      renderer: options.finalVideoRenderer,
      options: {
        muxSettings: input.options?.finalMuxSettings,
        reuseExistingAssets: shouldReuseAsset(input.options, "finalVideo"),
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
