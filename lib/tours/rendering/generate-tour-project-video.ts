import {
  preflightTourRender,
  type TourRenderOptions,
  type TourRenderPreflightIssue,
  type TourRenderPreflightResult,
} from "./tour-render-preflight";
import {
  createTourRenderRepository,
  type TourRenderRepository,
  type TourRenderRun,
  type TourRenderStep,
} from "./tour-render.repository";
import {
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  planTourScriptStage,
  type TourScriptPlanningProvider,
} from "./tour-script-planning";
import { getUserApiKey } from "@/lib/user-api-keys/service";
import {
  generateVoiceoverStage,
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
  type SceneClipRenderer,
} from "./tour-scene-clips";

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
  imageToVideoProvider?: ImageToVideoProvider;
  getApiKey?: typeof getUserApiKey;
};

const POST_SCRIPT_RENDER_SHELL_STEPS: TourRenderProgressUpdate[] = [
  {
    step: "uploading_final",
    label: "Uploading Final Video",
    progressPercent: 90,
    message: "Final video upload stage reserved for the production render pipeline.",
  },
];

const RENDER_WORKFLOW_NOT_IMPLEMENTED_MESSAGE =
  "Final video rendering is not implemented yet.";

function safeErrorMessage(_error: unknown): string {
  if (_error instanceof TourTransitionDetectionError) {
    if (_error.code === "PROVIDER_RESPONSE_INVALID") {
      return "Scene transition detection returned an invalid response.";
    }
    if (_error.code === "TRANSITION_TIMING_INVALID" || _error.code === "TRANSCRIPT_INVALID") {
      return "Scene transition timing could not be validated.";
    }
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

  return "Tour render failed before rendering could complete.";
}

function summarizePreflightFailure(preflight: Extract<TourRenderPreflightResult, { ok: false }>): string {
  const firstIssue: TourRenderPreflightIssue | undefined = preflight.issues[0];
  return firstIssue?.message ?? "Tour project is not ready for rendering.";
}

function needsVoiceover(tourType: string): boolean {
  return tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
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
        reuseExistingAssets: input.options?.reuseExistingAssets,
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
    let transitionAssetIds:
      | { transitionsAssetId: string; durationsAssetId: string }
      | null = null;
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
        scriptPlan: scriptPlanResult.plan,
        repository,
        provider: voiceoverProvider,
        getApiKey: options.getApiKey,
        options: {
          reuseExistingAssets: input.options?.reuseExistingAssets,
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
          reuseExistingAssets: input.options?.reuseExistingAssets,
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
      options: {
        renderMode: input.options?.renderMode ?? preflightResult.summary.renderMode,
        reuseExistingAssets: input.options?.reuseExistingAssets,
        providerModelId: input.options?.sceneClipProviderModelId,
        renderSettings: input.options?.sceneClipRenderSettings,
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

    for (const step of POST_SCRIPT_RENDER_SHELL_STEPS) {
      await recordProgress(repository, input, {
        ...step,
        metadata: {
          ...(step.metadata ?? {}),
          preflightSummary: preflightResult.summary,
          scriptPlanAssetId: scriptPlanResult.asset.id,
          ...(voiceoverAssetIds ?? {}),
          ...(transitionAssetIds ?? {}),
          sceneClipAssetIds: sceneClipResult.clips.map((clip) => clip.asset.id),
        },
      });
    }

    return markShellFailed(
      repository,
      input,
      RENDER_WORKFLOW_NOT_IMPLEMENTED_MESSAGE
    );
  } catch (error) {
    return markShellFailed(repository, input, safeErrorMessage(error));
  }
}
