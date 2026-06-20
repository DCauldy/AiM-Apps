import {
  buildOpenRouterScriptPlanPrompt,
  buildOpenRouterScriptPlanSystemPrompt,
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
  type TourScriptPlanningPromptInput,
} from "../providers/openrouter-script-planning-prompts";
import { buildOpenRouterSceneClipPrompt } from "../scenes/openrouter-scene-clip-prompts";
import type { TourRenderOptions } from "../preflight/preflight";
import type { TourSceneCameraMotion } from "@/lib/tours/scenes.core";
import type { TourProjectType } from "@/lib/tours/project-types";

export type TourRenderPromptPreviewScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: TourSceneCameraMotion;
  authoritativePhoto?: {
    id: string;
    previewUrl: string | null;
  } | null;
  sourcePhotos?: Array<{
    id: string;
    previewUrl: string | null;
  }>;
  facts?: Array<{
    id: string;
    text: string;
    sourcePhotoId: string | null;
    proofStatus: "proofed" | "suggested" | "rejected";
    sortOrder: number;
  }>;
};

export type TourRenderPromptPreviewProject = {
  id: string;
  name: string;
  propertyAddress: string;
  listingUrl: string | null;
  tourType: TourProjectType;
  scenes: TourRenderPromptPreviewScene[];
};

export type TourRenderPromptPreview =
  | {
      available: true;
      title: string;
      description: string;
      sections: Array<{
        label: string;
        content: string;
      }>;
    }
  | {
      available: false;
      title: string;
      message: string;
    };

const DEFAULT_SCRIPT_TIMING_OPTIONS = {
  fallbackDurationSeconds: 5,
  minDurationSeconds: 3,
  maxDurationSeconds: 9,
};
const DEFAULT_SCENE_CLIP_PROVIDER_MODEL_ID = "kwaivgi/kling-v3.0-std";

export function buildTourRenderScriptPlannerPromptPreview(input: {
  project: TourRenderPromptPreviewProject | null;
  options: TourRenderOptions;
}): TourRenderPromptPreview {
  if (!input.project) {
    return unavailable(
      "Script Planner Prompt",
      "Script planner prompt preview is unavailable because the project context has not loaded yet.",
    );
  }

  const scenes = includedScenes(input.project.scenes);
  if (scenes.length === 0) {
    return unavailable(
      "Script Planner Prompt",
      "Script planner prompt preview is unavailable until the project has at least one included scene.",
    );
  }

  const modelId =
    input.options.scriptPlanningModelId ?? DEFAULT_TOUR_SCRIPT_PLANNING_MODEL;
  const providerInput: TourScriptPlanningPromptInput = {
    project: {
      id: input.project.id,
      name: input.project.name,
      propertyAddress: input.project.propertyAddress,
      listingUrl: input.project.listingUrl,
      tourType: input.project.tourType,
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      cameraMotion: scene.cameraMotion,
      proofedFacts: (scene.facts ?? [])
        .filter((fact) => fact.proofStatus === "proofed")
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map((fact) => ({
          text: fact.text,
        })),
    })),
    promptVersion: TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
    timing: DEFAULT_SCRIPT_TIMING_OPTIONS,
  };

  return {
    available: true,
    title: "Script Planner Prompt",
    description: `Model: ${modelId}. Scenes: ${scenes.length}.`,
    sections: [
      {
        label: "System Prompt",
        content: buildOpenRouterScriptPlanSystemPrompt(),
      },
      {
        label: "User Prompt",
        content: buildOpenRouterScriptPlanPrompt(providerInput),
      },
    ],
  };
}

export function buildTourRenderImageToVideoPromptPreview(input: {
  project: TourRenderPromptPreviewProject | null;
  options: TourRenderOptions;
}): TourRenderPromptPreview {
  if (!input.project) {
    return unavailable(
      "Image To Video Prompt",
      "Image-to-video prompt preview is unavailable because the project context has not loaded yet.",
    );
  }

  const renderMode = input.options.renderMode ?? "ken_burns_ffmpeg";
  if (renderMode !== "provider_image_to_video") {
    return unavailable(
      "Image To Video Prompt",
      "Image-to-video prompt preview is unavailable while Ken Burns FFmpeg mode is selected.",
    );
  }

  const firstScene = includedScenes(input.project.scenes)[0];
  if (!firstScene) {
    return unavailable(
      "Image To Video Prompt",
      "Image-to-video prompt preview is unavailable until the project has at least one included scene.",
    );
  }

  const secondarySourceImageUrls =
    firstScene.sourcePhotos
      ?.filter((photo) => photo.id !== firstScene.authoritativePhoto?.id)
      .map((photo) => photo.previewUrl)
      .filter((url): url is string => Boolean(url)) ?? [];
  const prompt = buildOpenRouterSceneClipPrompt({
    scene: {
      title: firstScene.title,
      cameraMotion: firstScene.cameraMotion,
    },
    secondarySourceImageUrls,
  });
  const modelId =
    input.options.sceneClipProviderModelId ?? DEFAULT_SCENE_CLIP_PROVIDER_MODEL_ID;

  return {
    available: true,
    title: "Image To Video Prompt",
    description: `Model: ${modelId}. Previewing first included scene: ${firstScene.title}.`,
    sections: [
      {
        label: "Provider Prompt",
        content: prompt,
      },
      {
        label: "Request Details",
        content: [
          `model: ${modelId}`,
          "resolution: 720p",
          "aspect_ratio: 9:16",
          "generate_audio: false",
          `primary_first_frame_available: ${Boolean(firstScene.authoritativePhoto?.previewUrl)}`,
          `secondary_reference_count: ${secondarySourceImageUrls.length}`,
        ].join("\n"),
      },
    ],
  };
}

function unavailable(title: string, message: string): TourRenderPromptPreview {
  return {
    available: false,
    title,
    message,
  };
}

function includedScenes(scenes: TourRenderPromptPreviewScene[]) {
  return scenes
    .filter((scene) => scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export const TOUR_RENDER_PROMPT_PREVIEW_DEFAULTS = {
  scriptPlanningModelId: DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  sceneClipProviderModelId: DEFAULT_SCENE_CLIP_PROVIDER_MODEL_ID,
};
