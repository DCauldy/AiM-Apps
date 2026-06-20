import type {
  TourRenderMode,
  TourRenderOptions,
} from "../preflight/preflight";
import { TOUR_PROJECT_TYPES, type TourProjectType } from "../../projects/project-types";

type TourRenderOptionValidationResult =
  | { ok: true; options?: TourRenderOptions }
  | { ok: false; errors: string[] };

const SUPPORTED_REUSE_FLAGS = [
  "scriptPlan",
  "voiceover",
  "avatar",
  "sceneClips",
  "finalVideo",
] as const;

type SupportedReuseFlag = (typeof SUPPORTED_REUSE_FLAGS)[number];
export type { SupportedReuseFlag };

export type TourRenderInvestigationOptions = Pick<
  TourRenderOptions,
  | "renderMode"
  | "reuseExistingAssets"
  | "reuse"
  | "scriptPlanningModelId"
  | "sceneClipProviderModelId"
  | "tourType"
>;

export type TourRenderAdvancedControlsState = {
  renderMode: TourRenderMode;
  scriptPlanningModelId: string;
  sceneClipProviderModelId: string;
  reuse: Record<SupportedReuseFlag, boolean>;
};

export type TourRenderModelOption = {
  id: string;
  label: string;
};

export type TourRenderPreset =
  | "reuse_everything_possible"
  | "regenerate_scene_clips"
  | "regenerate_final_video"
  | "cheap_ken_burns_ux_test"
  | "provider_image_to_video_quality_experiment"
  | "script_model_experiment"
  | "full_fresh_render";

const DEFAULT_PROVIDER_SCENE_CLIP_MODEL_ID = "kwaivgi/kling-v3.0-std";
const DEFAULT_SCRIPT_PLANNING_MODEL_ID = "google/gemini-2.5-flash";

export const TOUR_RENDER_SCRIPT_PLANNING_MODEL_OPTIONS = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "google/gemma-3-4b-it", label: "Gemma 3 4B" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "z-ai/glm-4.6v", label: "GLM 4.6V" },
  { id: "openai/gpt-5", label: "GPT-5" },
] as const satisfies readonly TourRenderModelOption[];

export const TOUR_RENDER_SCENE_CLIP_MODEL_OPTIONS = [
  { id: "kwaivgi/kling-v3.0-std", label: "Kling v3.0 Standard" },
  { id: "kwaivgi/kling-v3.0-pro", label: "Kling v3.0 Pro" },
  { id: "kwaivgi/kling-video-o1", label: "Kling Video O1" },
  { id: "x-ai/grok-imagine-video", label: "Grok Imagine Video" },
  { id: "google/veo-3.1-lite", label: "Veo 3.1 Lite" },
  { id: "bytedance/seedance-2.0", label: "Seedance 2.0" },
] as const satisfies readonly TourRenderModelOption[];

const REUSE_ALL_SUPPORTED_ASSETS: Required<
  NonNullable<TourRenderOptions["reuse"]>
> = {
  scriptPlan: true,
  voiceover: true,
  avatar: true,
  sceneClips: true,
  finalVideo: true,
};

const REGENERATE_ALL_SUPPORTED_ASSETS: Required<
  NonNullable<TourRenderOptions["reuse"]>
> = {
  scriptPlan: false,
  voiceover: false,
  avatar: false,
  sceneClips: false,
  finalVideo: false,
};

export const TOUR_RENDER_PRESET_LABELS: Record<TourRenderPreset, string> = {
  reuse_everything_possible: "Reuse everything possible",
  regenerate_scene_clips: "Regenerate scene clips",
  regenerate_final_video: "Regenerate final video",
  cheap_ken_burns_ux_test: "Cheap Ken Burns UX test",
  provider_image_to_video_quality_experiment:
    "Provider image-to-video quality experiment",
  script_model_experiment: "Script model experiment",
  full_fresh_render: "Full fresh render",
};

export const TOUR_RENDER_PRESETS = Object.keys(
  TOUR_RENDER_PRESET_LABELS,
) as TourRenderPreset[];

const SUPPORTED_REUSE_FLAG_SET = new Set<string>(SUPPORTED_REUSE_FLAGS);
const TOUR_PROJECT_TYPE_SET = new Set<string>(TOUR_PROJECT_TYPES);
export const TOUR_RENDER_REUSE_FLAGS = [...SUPPORTED_REUSE_FLAGS];
export const TOUR_RENDER_REUSE_FLAG_LABELS: Record<SupportedReuseFlag, string> =
  {
    scriptPlan: "Script plan",
    voiceover: "Voiceover",
    avatar: "Avatar",
    sceneClips: "Scene clips",
    finalVideo: "Final video",
  };

export const TOUR_RENDER_MODES: TourRenderMode[] = [
  "ken_burns_ffmpeg",
  "provider_image_to_video",
];

export const TOUR_RENDER_MODE_LABELS: Record<TourRenderMode, string> = {
  ken_burns_ffmpeg: "Ken Burns FFmpeg",
  provider_image_to_video: "Provider image-to-video",
};

const SUPPORTED_RENDER_OPTION_KEYS = new Set([
  "renderMode",
  "reuseExistingAssets",
  "reuse",
  "scriptPlanningModelId",
  "sceneClipProviderModelId",
]);
const SUPPORTED_RENDER_MODES = new Set<TourRenderMode>([...TOUR_RENDER_MODES]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedRenderMode(value: unknown): value is TourRenderMode {
  return (
    typeof value === "string" &&
    SUPPORTED_RENDER_MODES.has(value as TourRenderMode)
  );
}

function isTourProjectType(value: unknown): value is TourProjectType {
  return (
    typeof value === "string" &&
    TOUR_PROJECT_TYPE_SET.has(value as TourProjectType)
  );
}

function assignModelIdOption(
  options: TourRenderOptions,
  key: "scriptPlanningModelId" | "sceneClipProviderModelId",
  value: unknown,
  errors: string[],
) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    errors.push(`${key} must be a string when provided.`);
    return;
  }

  const trimmed = value.trim();
  if (trimmed) {
    options[key] = trimmed;
  }
}

function withReuse(reuse: TourRenderOptions["reuse"]): TourRenderOptions {
  return {
    reuseExistingAssets: true,
    reuse,
  };
}

export function getTourRenderOptionsForPreset(
  preset: TourRenderPreset,
): TourRenderOptions {
  switch (preset) {
    case "reuse_everything_possible":
      return withReuse({ ...REUSE_ALL_SUPPORTED_ASSETS });
    case "regenerate_scene_clips":
      return withReuse({
        ...REUSE_ALL_SUPPORTED_ASSETS,
        sceneClips: false,
        finalVideo: false,
      });
    case "regenerate_final_video":
      return withReuse({
        ...REUSE_ALL_SUPPORTED_ASSETS,
        finalVideo: false,
      });
    case "cheap_ken_burns_ux_test":
      return {
        renderMode: "ken_burns_ffmpeg",
        ...withReuse({
          ...REUSE_ALL_SUPPORTED_ASSETS,
          sceneClips: false,
          finalVideo: false,
        }),
      };
    case "provider_image_to_video_quality_experiment":
      return {
        renderMode: "provider_image_to_video",
        sceneClipProviderModelId: DEFAULT_PROVIDER_SCENE_CLIP_MODEL_ID,
        ...withReuse({
          ...REUSE_ALL_SUPPORTED_ASSETS,
          sceneClips: false,
          finalVideo: false,
        }),
      };
    case "script_model_experiment":
      return {
        scriptPlanningModelId: DEFAULT_SCRIPT_PLANNING_MODEL_ID,
        ...withReuse({ ...REGENERATE_ALL_SUPPORTED_ASSETS }),
      };
    case "full_fresh_render":
      return {
        reuseExistingAssets: false,
        reuse: { ...REGENERATE_ALL_SUPPORTED_ASSETS },
      };
  }
}

export function getAdvancedControlsStateForPreset(
  preset: TourRenderPreset,
): TourRenderAdvancedControlsState {
  const options = getTourRenderOptionsForPreset(preset);
  return {
    renderMode: options.renderMode ?? "ken_burns_ffmpeg",
    scriptPlanningModelId: options.scriptPlanningModelId ?? "",
    sceneClipProviderModelId: options.sceneClipProviderModelId ?? "",
    reuse: {
      ...REUSE_ALL_SUPPORTED_ASSETS,
      ...(options.reuse ?? {}),
    },
  };
}

export function buildTourRenderOptionsFromAdvancedControls(
  controls: TourRenderAdvancedControlsState,
): TourRenderOptions {
  const options: TourRenderOptions = {
    renderMode: controls.renderMode,
    reuseExistingAssets: Object.values(controls.reuse).some(Boolean),
    reuse: { ...controls.reuse },
  };

  const scriptPlanningModelId = controls.scriptPlanningModelId.trim();
  if (scriptPlanningModelId) {
    options.scriptPlanningModelId = scriptPlanningModelId;
  }

  const sceneClipProviderModelId = controls.sceneClipProviderModelId.trim();
  if (sceneClipProviderModelId) {
    options.sceneClipProviderModelId = sceneClipProviderModelId;
  }

  return options;
}

export function sanitizeTourRenderInvestigationOptions(
  value: Record<string, unknown> | null | undefined,
): TourRenderInvestigationOptions {
  const options: TourRenderInvestigationOptions = {};

  if (!isRecord(value)) {
    return options;
  }

  if (isSupportedRenderMode(value.renderMode)) {
    options.renderMode = value.renderMode;
  }

  if (typeof value.reuseExistingAssets === "boolean") {
    options.reuseExistingAssets = value.reuseExistingAssets;
  }

  if (isRecord(value.reuse)) {
    const reuse: NonNullable<TourRenderInvestigationOptions["reuse"]> = {};
    for (const flag of SUPPORTED_REUSE_FLAGS) {
      if (typeof value.reuse[flag] === "boolean") {
        reuse[flag] = value.reuse[flag];
      }
    }

    if (Object.keys(reuse).length > 0) {
      options.reuse = reuse;
    }
  }

  if (typeof value.scriptPlanningModelId === "string") {
    const scriptPlanningModelId = value.scriptPlanningModelId.trim();
    if (scriptPlanningModelId) {
      options.scriptPlanningModelId = scriptPlanningModelId;
    }
  }

  if (typeof value.sceneClipProviderModelId === "string") {
    const sceneClipProviderModelId = value.sceneClipProviderModelId.trim();
    if (sceneClipProviderModelId) {
      options.sceneClipProviderModelId = sceneClipProviderModelId;
    }
  }

  if (isTourProjectType(value.tourType)) {
    options.tourType = value.tourType;
  }

  return options;
}

export function parseTourRenderOptionsInput(
  value: unknown,
): TourRenderOptionValidationResult {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value)) {
    return { ok: false, errors: ["options must be an object when provided."] };
  }

  const errors: string[] = [];
  const options: TourRenderOptions = {};

  for (const key of Object.keys(value)) {
    if (!SUPPORTED_RENDER_OPTION_KEYS.has(key)) {
      errors.push(`${key} is not a supported render option.`);
    }
  }

  if (value.renderMode !== undefined) {
    if (isSupportedRenderMode(value.renderMode)) {
      options.renderMode = value.renderMode;
    } else {
      errors.push(
        "renderMode must be ken_burns_ffmpeg or provider_image_to_video.",
      );
    }
  }

  if (value.reuseExistingAssets !== undefined) {
    if (typeof value.reuseExistingAssets === "boolean") {
      options.reuseExistingAssets = value.reuseExistingAssets;
    } else {
      errors.push("reuseExistingAssets must be a boolean when provided.");
    }
  }

  if (value.reuse !== undefined) {
    if (!isRecord(value.reuse)) {
      errors.push("reuse must be an object when provided.");
    } else {
      const reuse: NonNullable<TourRenderOptions["reuse"]> = {};
      for (const key of Object.keys(value.reuse)) {
        if (!SUPPORTED_REUSE_FLAG_SET.has(key)) {
          errors.push(`reuse.${key} is not a supported reuse flag.`);
          continue;
        }

        const flagValue = value.reuse[key];
        if (flagValue === undefined) {
          continue;
        }
        if (typeof flagValue !== "boolean") {
          errors.push(`reuse.${key} must be a boolean when provided.`);
          continue;
        }

        reuse[key as SupportedReuseFlag] = flagValue;
      }

      if (Object.keys(reuse).length > 0) {
        options.reuse = reuse;
      }
    }
  }

  assignModelIdOption(
    options,
    "scriptPlanningModelId",
    value.scriptPlanningModelId,
    errors,
  );
  assignModelIdOption(
    options,
    "sceneClipProviderModelId",
    value.sceneClipProviderModelId,
    errors,
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
}
