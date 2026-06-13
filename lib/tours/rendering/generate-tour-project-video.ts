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
  getApiKey?: typeof getUserApiKey;
};

const POST_SCRIPT_RENDER_SHELL_STEPS: TourRenderProgressUpdate[] = [
  {
    step: "rendering_scene_clips",
    label: "Rendering Scene Clips",
    progressPercent: 70,
    message: "Scene clip rendering stage reserved for the production render pipeline.",
  },
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
  return "Tour render failed before rendering could complete.";
}

function summarizePreflightFailure(preflight: Extract<TourRenderPreflightResult, { ok: false }>): string {
  const firstIssue: TourRenderPreflightIssue | undefined = preflight.issues[0];
  return firstIssue?.message ?? "Tour project is not ready for rendering.";
}

function needsVoiceover(tourType: string): boolean {
  return tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
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
    }

    for (const step of POST_SCRIPT_RENDER_SHELL_STEPS) {
      await recordProgress(repository, input, {
        ...step,
        metadata: {
          ...(step.metadata ?? {}),
          preflightSummary: preflightResult.summary,
          scriptPlanAssetId: scriptPlanResult.asset.id,
          ...(voiceoverAssetIds ?? {}),
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
