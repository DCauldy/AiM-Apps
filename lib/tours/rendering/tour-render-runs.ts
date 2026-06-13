import "server-only";

import { tasks } from "@trigger.dev/sdk/v3";
import type { renderTourProjectTask } from "@/src/triggers/render-tour-project";
import type { toursRenderNoopProofTask } from "@/src/triggers/tours-render-noop-proof";
import {
  isTourRenderRunActive,
  type TourRenderTimelineStep,
  type TourRenderRunStatusResponse,
} from "./tour-render.contract";
import type { TourProjectType } from "../project-types";
import {
  createTourRenderRepository,
  type TourRenderRepository,
  type TourRenderRun,
  type TourRenderStep,
} from "./tour-render.repository";
import {
  preflightTourRender,
  type TourRenderOptions,
  type TourRenderPreflightResult,
} from "./tour-render-preflight";

type CreateFakeTourRenderRunInput = {
  projectId: string;
  userId: string;
};

type CreateTourRenderRunInput = CreateFakeTourRenderRunInput & {
  options?: TourRenderOptions;
};

type FakeRenderRunServiceOptions = {
  repository?: TourRenderRepository;
  triggerTask?: typeof tasks.trigger<typeof toursRenderNoopProofTask>;
  skipPreflight?: boolean;
};

type RenderRunServiceOptions = {
  repository?: TourRenderRepository;
};

type CreateTourRenderRunServiceOptions = RenderRunServiceOptions & {
  triggerTask?: typeof tasks.trigger<typeof renderTourProjectTask>;
  skipPreflight?: boolean;
};

const FAKE_RENDER_OPTIONS = {
  fakeRenderRun: true,
  renderMode: "ken_burns_ffmpeg",
  reuseExistingAssets: true,
} as const;

const DEFAULT_RENDER_OPTIONS: TourRenderOptions = {
  renderMode: "ken_burns_ffmpeg",
  reuseExistingAssets: true,
};

const TRIGGER_ATTACH_TIMEOUT_MS = 3_000;
const RENDER_TASK_ENQUEUE_FAILED_MESSAGE =
  "Could not start the render task. Try again.";

type FakeRenderStage = {
  elapsedMs: number;
  step: TourRenderStep;
  label: string;
  progressPercent: number;
  sceneClipCompletedCount: number;
  complete?: boolean;
};

const TIMELINE_STEP_DETAILS: Record<TourRenderStep, TourRenderTimelineStep> = {
  queued: {
    key: "queued",
    label: "Queued",
    detail: "Render request received",
  },
  preparing_assets: {
    key: "preparing_assets",
    label: "Preparing Assets",
    detail: "Checking listing media and scene inputs",
  },
  planning_script: {
    key: "planning_script",
    label: "Planning Script",
    detail: "Structuring the property tour",
  },
  generating_voiceover: {
    key: "generating_voiceover",
    label: "Generating Voiceover",
    detail: "Creating narration timing",
  },
  generating_avatar: {
    key: "generating_avatar",
    label: "Generating Avatar",
    detail: "Creating the presenter layer",
  },
  detecting_transitions: {
    key: "detecting_transitions",
    label: "Detecting Transitions",
    detail: "Matching motion between scenes",
  },
  rendering_scene_clips: {
    key: "rendering_scene_clips",
    label: "Rendering Scene Clips",
    detail: "Building individual scene video clips",
  },
  joining_video: {
    key: "joining_video",
    label: "Joining Scene Clips",
    detail: "Combining rendered scenes",
  },
  uploading_final: {
    key: "uploading_final",
    label: "Uploading Final Video",
    detail: "Saving the generated tour",
  },
  completed: {
    key: "completed",
    label: "Completed",
    detail: "Tour render is ready",
  },
  failed: {
    key: "failed",
    label: "Failed",
    detail: "Render could not finish",
  },
};

function getFakeRenderTourType(run: TourRenderRun): TourProjectType {
  return run.options.tourType === "tour_video_voice_over" || run.options.tourType === "tour_video_avatar"
    ? run.options.tourType
    : "tour_video";
}

function getPipelineStepKeys(tourType: TourProjectType): TourRenderStep[] {
  const steps: TourRenderStep[] = ["queued", "preparing_assets", "planning_script"];

  if (tourType === "tour_video_voice_over" || tourType === "tour_video_avatar") {
    steps.push("generating_voiceover");
  }

  if (tourType === "tour_video_avatar") {
    steps.push("generating_avatar");
  }

  steps.push("detecting_transitions", "rendering_scene_clips", "joining_video", "uploading_final");
  return steps;
}

function getPipelineStepsForTourType(tourType: TourProjectType): TourRenderTimelineStep[] {
  return getPipelineStepKeys(tourType).map((step) => TIMELINE_STEP_DETAILS[step]);
}

function getFakeRenderStages(tourType: TourProjectType): FakeRenderStage[] {
  const stepKeys = getPipelineStepKeys(tourType);
  const stageCount = stepKeys.length + 1;
  const stageDurationMs = 3_500;

  const stages: FakeRenderStage[] = stepKeys.map((step, index) => ({
    elapsedMs: index * stageDurationMs,
    step,
    label: TIMELINE_STEP_DETAILS[step].label,
    progressPercent: Math.min(94, Math.round((index / stageCount) * 100)),
    sceneClipCompletedCount:
      step === "joining_video" || step === "uploading_final"
        ? 2
        : step === "rendering_scene_clips"
          ? 0
          : 0,
  }));

  const renderingIndex = stepKeys.indexOf("rendering_scene_clips");
  if (renderingIndex >= 0) {
    stages.splice(renderingIndex + 1, 0, {
      elapsedMs: renderingIndex * stageDurationMs + Math.round(stageDurationMs * 0.65),
      step: "rendering_scene_clips",
      label: TIMELINE_STEP_DETAILS.rendering_scene_clips.label,
      progressPercent: Math.min(86, Math.round(((renderingIndex + 0.65) / stageCount) * 100)),
      sceneClipCompletedCount: 1,
    });
  }

  stages.push({
    elapsedMs: stageKeysDuration(stepKeys.length, stageDurationMs),
    step: "completed",
    label: TIMELINE_STEP_DETAILS.completed.label,
    progressPercent: 100,
    sceneClipCompletedCount: 2,
    complete: true,
  });

  return stages.sort((a, b) => a.elapsedMs - b.elapsedMs);
}

function stageKeysDuration(stepCount: number, stageDurationMs: number): number {
  return stepCount * stageDurationMs;
}

export function toTourRenderRunStatusResponse(run: TourRenderRun): TourRenderRunStatusResponse {
  return {
    id: run.id,
    status: run.status,
    step: run.currentStep,
    label: run.currentStepLabel,
    timelineSteps: getPipelineStepsForTourType(getFakeRenderTourType(run)),
    progressPercent: run.progressPercent,
    sceneClipCounts: {
      completed: run.sceneClipCompletedCount,
      total: run.sceneClipTotalCount,
    },
    updatedAt: run.updatedAt,
    result: run.resultAssetId ? { assetId: run.resultAssetId } : null,
    error: run.errorMessage ? { message: run.errorMessage } : null,
    triggerRunId: run.triggerRunId,
  };
}

export function toTourRenderRunStatusResponseWithResultUrl(
  run: TourRenderRun,
  resultUrl: { downloadUrl: string; storagePath: string } | null
): TourRenderRunStatusResponse {
  const response = toTourRenderRunStatusResponse(run);
  if (!response.result || !resultUrl) {
    return response;
  }

  return {
    ...response,
    result: {
      ...response.result,
      downloadUrl: resultUrl.downloadUrl,
      storagePath: resultUrl.storagePath,
    },
  };
}

function isFakeRenderRun(run: TourRenderRun): boolean {
  return run.options.fakeRenderRun === true;
}

function pickFakeStage(run: TourRenderRun, nowMs = Date.now()) {
  const elapsedMs = Math.max(0, nowMs - new Date(run.createdAt).getTime());
  const stages = getFakeRenderStages(getFakeRenderTourType(run));
  return [...stages].reverse().find((stage) => elapsedMs >= stage.elapsedMs) ?? stages[0];
}

async function advanceFakeRunIfNeeded(
  repository: TourRenderRepository,
  run: TourRenderRun
): Promise<TourRenderRun> {
  if (!isFakeRenderRun(run) || !isTourRenderRunActive(run)) {
    return run;
  }

  const stage = pickFakeStage(run);
  if (stage.complete) {
    const existingResult = run.resultAssetId
      ? run
      : await createFakeFinalAssetAndComplete(repository, run, stage.label);
    return existingResult ?? run;
  }

  if (
    run.currentStep === stage.step &&
    run.progressPercent === stage.progressPercent &&
    run.sceneClipCompletedCount === stage.sceneClipCompletedCount
  ) {
    return run;
  }

  return (
    (await repository.updateProgress({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      step: stage.step,
      label: stage.label,
      progressPercent: stage.progressPercent,
      sceneClipCompletedCount: stage.sceneClipCompletedCount,
      sceneClipTotalCount: 2,
    })) ?? run
  );
}

async function createFakeFinalAssetAndComplete(
  repository: TourRenderRepository,
  run: TourRenderRun,
  label: string
): Promise<TourRenderRun | null> {
  const asset = await repository.createAsset({
    projectId: run.projectId,
    createdByRunId: run.id,
    kind: "final_video",
    fingerprintHash: `fake-render:${run.id}`,
    fingerprint: {
      fakeRenderRun: true,
      runId: run.id,
    },
    reusable: false,
    metadata: {
      label,
    },
  });

  if (!asset) {
    return repository.markFailed({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      step: "failed",
      label: "Failed",
      safeMessage: "Could not create the generated video record.",
    });
  }

  await repository.recordRunAssetUsage({
    runId: run.id,
    assetId: asset.id,
    usage: "result",
  });

  return repository.markCompleted({
    runId: run.id,
    projectId: run.projectId,
    userId: run.userId,
    resultAssetId: asset.id,
  });
}

export async function createFakeTourRenderRun(
  input: CreateFakeTourRenderRunInput,
  options: FakeRenderRunServiceOptions = {}
): Promise<TourRenderRun | null> {
  const repository = options.repository ?? (await createTourRenderRepository());
  if (!options.skipPreflight) {
    const preflight = await preflightTourRender(
      {
        projectId: input.projectId,
        userId: input.userId,
        options: FAKE_RENDER_OPTIONS,
      },
      { repository }
    );

    if (!preflight.ok) {
      return null;
    }
  }

  const renderableProject = await repository.getRenderableTourProject(input);
  if (!renderableProject) {
    return null;
  }

  const run = await repository.createRenderRun({
    projectId: input.projectId,
    userId: input.userId,
    sceneClipTotalCount: 2,
    options: {
      ...FAKE_RENDER_OPTIONS,
      tourType: renderableProject.project.tourType,
    },
  });

  if (!run) {
    return null;
  }

  const triggerTask = options.triggerTask ?? tasks.trigger<typeof toursRenderNoopProofTask>;
  const handle = await Promise.race([
    triggerTask(
      "tours-render-noop-proof",
      {
        projectId: input.projectId,
        userId: input.userId,
        renderRunId: run.id,
        options: {
          proofOnly: true,
          renderMode: FAKE_RENDER_OPTIONS.renderMode,
          reuseExistingAssets: FAKE_RENDER_OPTIONS.reuseExistingAssets,
        },
      },
      {
        tags: [`user:${input.userId}`, `tour-project:${input.projectId}`, "tours-render-fake-progress"],
        metadata: {
          product: "tours",
          fakeRenderRun: true,
          projectId: input.projectId,
          renderRunId: run.id,
        },
      },
    ).catch(() => null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), TRIGGER_ATTACH_TIMEOUT_MS);
    }),
  ]);

  if (!handle?.id) {
    return run;
  }

  return (await repository.attachTriggerRunId({
    runId: run.id,
    projectId: input.projectId,
    userId: input.userId,
    triggerRunId: handle.id,
  })) ?? run;
}

export async function preflightFakeTourRenderRun(
  input: CreateFakeTourRenderRunInput,
  options: Pick<FakeRenderRunServiceOptions, "repository"> = {}
): Promise<TourRenderPreflightResult> {
  const repository = options.repository ?? (await createTourRenderRepository());
  return preflightTourRender(
    {
      projectId: input.projectId,
      userId: input.userId,
      options: FAKE_RENDER_OPTIONS,
    },
    { repository }
  );
}

export async function createTourRenderRun(
  input: CreateTourRenderRunInput,
  options: CreateTourRenderRunServiceOptions = {}
): Promise<TourRenderRun | null> {
  const repository = options.repository ?? (await createTourRenderRepository());
  const renderOptions: TourRenderOptions = {
    ...DEFAULT_RENDER_OPTIONS,
    ...(input.options ?? {}),
  };

  if (!options.skipPreflight) {
    const preflight = await preflightTourRender(
      {
        projectId: input.projectId,
        userId: input.userId,
        options: renderOptions,
      },
      { repository }
    );

    if (!preflight.ok) {
      return null;
    }
  }

  const renderableProject = await repository.getRenderableTourProject(input);
  if (!renderableProject) {
    return null;
  }

  const run = await repository.createRenderRun({
    projectId: input.projectId,
    userId: input.userId,
    sceneClipTotalCount: renderableProject.scenes.filter((scene) => scene.included).length,
    options: {
      ...renderOptions,
      tourType: renderableProject.project.tourType,
    },
  });

  if (!run) {
    return null;
  }

  const triggerTask = options.triggerTask ?? tasks.trigger<typeof renderTourProjectTask>;
  const handle = await Promise.race([
    triggerTask(
      "render-tour-project",
      {
        projectId: input.projectId,
        userId: input.userId,
        renderRunId: run.id,
        options: {
          ...renderOptions,
          tourType: renderableProject.project.tourType,
        },
      },
      {
        idempotencyKey: `tour-render:${run.id}`,
        tags: [`user:${input.userId}`, `tour-project:${input.projectId}`, "render-tour-project"],
        metadata: {
          product: "tours",
          projectId: input.projectId,
          renderRunId: run.id,
          step: "queued",
          progressPercent: 0,
        },
      },
    ).catch(() => null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), TRIGGER_ATTACH_TIMEOUT_MS);
    }),
  ]);

  if (!handle?.id) {
    const failedRun = await repository.markFailed({
      runId: run.id,
      projectId: input.projectId,
      userId: input.userId,
      step: "failed",
      label: "Failed",
      safeMessage: RENDER_TASK_ENQUEUE_FAILED_MESSAGE,
    });

    await repository.appendEvent({
      runId: run.id,
      projectId: input.projectId,
      step: "failed",
      status: "failed",
      safeMessage: RENDER_TASK_ENQUEUE_FAILED_MESSAGE,
      metadata: {
        reason: "trigger_enqueue_failed",
      },
    });

    return failedRun ?? run;
  }

  return (await repository.attachTriggerRunId({
    runId: run.id,
    projectId: input.projectId,
    userId: input.userId,
    triggerRunId: handle.id,
  })) ?? run;
}

export async function preflightTourRenderRun(
  input: CreateTourRenderRunInput,
  options: RenderRunServiceOptions = {}
): Promise<TourRenderPreflightResult> {
  const repository = options.repository ?? (await createTourRenderRepository());
  return preflightTourRender(
    {
      projectId: input.projectId,
      userId: input.userId,
      options: {
        ...DEFAULT_RENDER_OPTIONS,
        ...(input.options ?? {}),
      },
    },
    { repository }
  );
}

export async function getTourRenderRunStatus(
  input: {
    projectId: string;
    userId: string;
    runId: string;
  },
  options: RenderRunServiceOptions = {}
): Promise<TourRenderRun | null> {
  const repository = options.repository ?? (await createTourRenderRepository());
  const run = await repository.getRenderRun(input);
  if (!run) {
    return null;
  }

  return advanceFakeRunIfNeeded(repository, run);
}

export async function getTourRenderRunResultUrl(
  input: {
    projectId: string;
    userId: string;
    runId: string;
    resultAssetId: string | null;
  },
  options: RenderRunServiceOptions = {}
): Promise<{ downloadUrl: string; storagePath: string } | null> {
  if (!input.resultAssetId) {
    return null;
  }

  const repository = options.repository ?? (await createTourRenderRepository());
  const asset = await repository.getAsset({
    assetId: input.resultAssetId,
    projectId: input.projectId,
  });

  if (
    !asset ||
    asset.kind !== "final_video" ||
    asset.storageBucket !== "tours-generated-media" ||
    !asset.storagePath
  ) {
    return null;
  }

  const signed = await repository.createSignedGeneratedMediaUrl({
    storageBucket: asset.storageBucket,
    storagePath: asset.storagePath,
  });

  if (!signed) {
    return null;
  }

  return {
    downloadUrl: signed.signedUrl,
    storagePath: signed.storagePath,
  };
}

export async function listRecentTourRenderRuns(
  input: {
    projectId: string;
    userId: string;
    limit?: number;
  },
  options: RenderRunServiceOptions = {}
): Promise<TourRenderRun[]> {
  const repository = options.repository ?? (await createTourRenderRepository());
  const runs = await repository.listRecentRenderRuns(input);
  return Promise.all(runs.map((run) => advanceFakeRunIfNeeded(repository, run)));
}
