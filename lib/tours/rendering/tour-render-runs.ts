import "server-only";

import { tasks } from "@trigger.dev/sdk/v3";
import type { renderTourProjectTask } from "@/triggers/render-tour-project";
import {
  type TourRenderRunAssetResponse,
  type TourRenderTimelineStep,
  type TourRenderRunStatusResponse,
} from "./tour-render.contract";
import type { TourProjectType } from "../project-types";
import {
  createTourRenderRepository,
  type TourRenderAsset,
  type TourRenderRepository,
  type TourRenderRun,
  type TourRenderStep,
} from "./tour-render.repository";
import {
  preflightTourRender,
  type TourRenderOptions,
  type TourRenderPreflightResult,
} from "./tour-render-preflight";

type CreateTourRenderRunInput = {
  projectId: string;
  userId: string;
  options?: TourRenderOptions;
};

type RenderRunServiceOptions = {
  repository?: TourRenderRepository;
};

type CreateTourRenderRunServiceOptions = RenderRunServiceOptions & {
  triggerTask?: typeof tasks.trigger<typeof renderTourProjectTask>;
  skipPreflight?: boolean;
};

const DEFAULT_RENDER_OPTIONS: TourRenderOptions = {
  renderMode: "ken_burns_ffmpeg",
  reuseExistingAssets: true,
};

const TRIGGER_ATTACH_TIMEOUT_MS = 3_000;
const RENDER_TASK_ENQUEUE_FAILED_MESSAGE =
  "Could not start the render task. Try again.";

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

function getRenderTourType(run: TourRenderRun): TourProjectType {
  return run.options.tourType === "tour_video_voice_over" || run.options.tourType === "tour_video_avatar"
    ? run.options.tourType
    : "tour_video";
}

function getPipelineStepKeys(tourType: TourProjectType): TourRenderStep[] {
  const steps: TourRenderStep[] = ["queued", "preparing_assets", "planning_script"];

  if (tourType === "tour_video_voice_over" || tourType === "tour_video_avatar") {
    steps.push("generating_voiceover");
    steps.push("detecting_transitions");
  }

  if (tourType === "tour_video_avatar") {
    steps.push("generating_avatar");
  }

  steps.push("rendering_scene_clips", "joining_video", "uploading_final");
  return steps;
}

function getPipelineStepsForTourType(tourType: TourProjectType): TourRenderTimelineStep[] {
  return getPipelineStepKeys(tourType).map((step) => TIMELINE_STEP_DETAILS[step]);
}

function shouldInvalidateReusableAssets(options: TourRenderOptions): boolean {
  return (
    options.reuseExistingAssets === false ||
    Object.values(options.reuse ?? {}).some((reuse) => reuse === false)
  );
}

export function toTourRenderRunStatusResponse(run: TourRenderRun): TourRenderRunStatusResponse {
  return {
    id: run.id,
    status: run.status,
    step: run.currentStep,
    label: run.currentStepLabel,
    timelineSteps: getPipelineStepsForTourType(getRenderTourType(run)),
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

  if (shouldInvalidateReusableAssets(renderOptions)) {
    const invalidated = await repository.markProjectAssetsNonReusable({
      projectId: input.projectId,
    });
    if (!invalidated) {
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
        concurrencyKey: `tour-project:${input.projectId}`,
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
  return repository.getRenderRun(input);
}

export async function listTourRenderRunAssetsWithUrls(
  input: {
    runId: string;
    userId: string;
  },
  options: RenderRunServiceOptions = {}
): Promise<TourRenderRunAssetResponse[] | null> {
  const repository = options.repository ?? (await createTourRenderRepository());
  const run = await repository.getRenderRunByIdForUser(input);

  if (!run) {
    return null;
  }

  const assets = await repository.listRunAssets({
    runId: run.id,
    projectId: run.projectId,
  });
  const assetsWithUrls = await Promise.all(
    assets.map(async (asset) => {
      if (asset.storageBucket !== "tours-generated-media" || !asset.storagePath) {
        return null;
      }

      const signed = await repository.createSignedGeneratedMediaUrl({
        storageBucket: asset.storageBucket,
        storagePath: asset.storagePath,
        downloadTitle: getTourRenderAssetDownloadName(asset),
      });

      if (!signed) {
        return null;
      }

      return {
        ...asset,
        name: getTourRenderAssetDownloadName(asset),
        url: signed.signedUrl,
      };
    })
  );

  return assetsWithUrls.flatMap((asset) => (asset ? [asset] : []));
}

export async function getTourRenderRunResultUrl(
  input: {
    projectId: string;
    userId: string;
    runId: string;
    resultAssetId: string | null;
    downloadTitle?: string;
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
    downloadTitle: input.downloadTitle,
  });

  if (!signed) {
    return null;
  }

  return {
    downloadUrl: signed.signedUrl,
    storagePath: signed.storagePath,
  };
}

function getTourRenderAssetDownloadName(asset: TourRenderAsset): string {
  if (asset.storagePath) {
    const storageName = asset.storagePath.split("/").pop()?.trim();
    if (storageName) {
      return storageName;
    }
  }

  return `${asset.kind.replace(/_/g, "-")}-${asset.id}`;
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
  return repository.listRecentRenderRuns(input);
}
