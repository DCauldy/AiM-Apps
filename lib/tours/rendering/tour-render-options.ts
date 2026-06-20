import type { TourRenderMode, TourRenderOptions } from "./tour-render-preflight";

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

const SUPPORTED_REUSE_FLAG_SET = new Set<string>(SUPPORTED_REUSE_FLAGS);
const SUPPORTED_RENDER_OPTION_KEYS = new Set([
  "renderMode",
  "reuseExistingAssets",
  "reuse",
  "scriptPlanningModelId",
  "sceneClipProviderModelId",
]);
const SUPPORTED_RENDER_MODES = new Set<TourRenderMode>([
  "ken_burns_ffmpeg",
  "provider_image_to_video",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedRenderMode(value: unknown): value is TourRenderMode {
  return typeof value === "string" && SUPPORTED_RENDER_MODES.has(value as TourRenderMode);
}

function assignModelIdOption(
  options: TourRenderOptions,
  key: "scriptPlanningModelId" | "sceneClipProviderModelId",
  value: unknown,
  errors: string[]
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

export function parseTourRenderOptionsInput(
  value: unknown
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
      errors.push("renderMode must be ken_burns_ffmpeg or provider_image_to_video.");
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

  assignModelIdOption(options, "scriptPlanningModelId", value.scriptPlanningModelId, errors);
  assignModelIdOption(options, "sceneClipProviderModelId", value.sceneClipProviderModelId, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
}
