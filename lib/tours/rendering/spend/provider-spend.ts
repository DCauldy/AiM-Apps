import type { TourProjectType } from "../../projects/project-types";
import type {
  TourRenderMode,
  TourRenderOptions,
} from "../preflight/preflight";

export type TourProviderSpendRisk = "low" | "moderate" | "high";

export type TourProviderSpendLineItem = {
  id:
    | "openrouter_script_planning"
    | "openrouter_scene_clips"
    | "elevenlabs_voiceover"
    | "heygen_avatar"
    | "local_ken_burns"
    | "local_final_mux";
  label: string;
  provider: "OpenRouter" | "ElevenLabs" | "HeyGen" | "Local";
  reason: string;
  estimatedCostUsd: number;
};

export type TourProviderSpendEstimate = {
  risk: TourProviderSpendRisk;
  riskLabel: string;
  estimatedTotalUsd: number;
  summary: string;
  assumptions: {
    includedSceneCount: number;
    clipSeconds: number;
    renderMode: TourRenderMode;
    tourType: TourProjectType;
    sceneClipProviderModelId: string | null;
  };
  lineItems: TourProviderSpendLineItem[];
};

export type TourProviderSpendEstimateInput = {
  includedSceneCount: number;
  tourType: TourProjectType;
  options: TourRenderOptions;
};

type TokenModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};
type ReuseFlag = keyof NonNullable<TourRenderOptions["reuse"]>;

export const TOUR_PROVIDER_SPEND_PRICING = {
  conservativeClipSeconds: 10,
  openRouterScriptPlanning: {
    "google/gemini-2.5-flash": {
      inputUsdPerMillionTokens: 0.3,
      outputUsdPerMillionTokens: 2.5,
    },
    "google/gemini-3.5-flash": {
      inputUsdPerMillionTokens: 1.5,
      outputUsdPerMillionTokens: 9,
    },
    default: {
      inputUsdPerMillionTokens: 0.3,
      outputUsdPerMillionTokens: 2.5,
    },
  } satisfies Record<string, TokenModelPricing>,
  openRouterSceneClips: {
    "kwaivgi/kling-v3.0-std": 0.126,
    "kwaivgi/kling-v3.0-pro": 0.168,
    "kwaivgi/kling-video-o1": 0.112,
    default: 0.126,
  } satisfies Record<string, number>,
  elevenLabsVoiceover: {
    defaultModelId: "eleven_multilingual_v2",
    usdPerCharacter: 0.0003,
    estimatedCharactersPerSecond: 14,
  },
  heyGenAvatar: {
    standardUsdPerMinute: 1,
  },
} as const;

const DEFAULT_RENDER_MODE: TourRenderMode = "ken_burns_ffmpeg";
const DEFAULT_SCRIPT_PLANNING_MODEL_ID = "google/gemini-2.5-flash";
const DEFAULT_SCENE_CLIP_PROVIDER_MODEL_ID = "kwaivgi/kling-v3.0-std";

function shouldRegenerate(
  options: TourRenderOptions,
  flag: ReuseFlag,
) {
  if (options.reuseExistingAssets === false) {
    return true;
  }

  return options.reuse?.[flag] === false;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function estimateScriptPlanningCost(options: TourRenderOptions, sceneCount: number) {
  const modelId = options.scriptPlanningModelId ?? DEFAULT_SCRIPT_PLANNING_MODEL_ID;
  const pricing =
    TOUR_PROVIDER_SPEND_PRICING.openRouterScriptPlanning[modelId] ??
    TOUR_PROVIDER_SPEND_PRICING.openRouterScriptPlanning.default;
  const inputTokens = 12_000 + sceneCount * 800;
  const outputTokens = 3_000 + sceneCount * 500;

  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}

function getSceneClipProviderModelId(options: TourRenderOptions) {
  return options.sceneClipProviderModelId ?? DEFAULT_SCENE_CLIP_PROVIDER_MODEL_ID;
}

function riskForTotal(total: number): TourProviderSpendRisk {
  if (total >= 2) return "high";
  if (total >= 0.25) return "moderate";
  return "low";
}

function riskLabel(risk: TourProviderSpendRisk) {
  switch (risk) {
    case "high":
      return "High provider spend";
    case "moderate":
      return "Moderate provider spend";
    case "low":
      return "Low provider spend";
  }
}

export function formatTourProviderSpendUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function estimateTourProviderSpend(
  input: TourProviderSpendEstimateInput,
): TourProviderSpendEstimate {
  const sceneCount = Math.max(0, Math.floor(input.includedSceneCount));
  const clipSeconds = TOUR_PROVIDER_SPEND_PRICING.conservativeClipSeconds;
  const renderMode = input.options.renderMode ?? DEFAULT_RENDER_MODE;
  const totalVideoSeconds = sceneCount * clipSeconds;
  const lineItems: TourProviderSpendLineItem[] = [];

  const regeneratesScriptPlan = shouldRegenerate(input.options, "scriptPlan");
  lineItems.push({
    id: "openrouter_script_planning",
    label: "Script planning",
    provider: "OpenRouter",
    reason: regeneratesScriptPlan
      ? "OpenRouter script planning is expected because script-plan reuse is off or this is a fresh run."
      : "OpenRouter script planning is not expected because script-plan reuse is requested.",
    estimatedCostUsd: regeneratesScriptPlan
      ? estimateScriptPlanningCost(input.options, sceneCount)
      : 0,
  });

  const regeneratesSceneClips = shouldRegenerate(input.options, "sceneClips");
  if (regeneratesSceneClips && renderMode === "provider_image_to_video") {
    const modelId = getSceneClipProviderModelId(input.options);
    const usdPerSecond =
      TOUR_PROVIDER_SPEND_PRICING.openRouterSceneClips[modelId] ??
      TOUR_PROVIDER_SPEND_PRICING.openRouterSceneClips.default;
    lineItems.push({
      id: "openrouter_scene_clips",
      label: "Provider scene clips",
      provider: "OpenRouter",
      reason: `OpenRouter provider image-to-video is expected for ${sceneCount} scene clip(s) with ${modelId}.`,
      estimatedCostUsd: sceneCount * clipSeconds * usdPerSecond,
    });
  } else {
    lineItems.push({
      id: "openrouter_scene_clips",
      label: "Provider scene clips",
      provider: "OpenRouter",
      reason:
        renderMode === "provider_image_to_video"
          ? "OpenRouter provider image-to-video is not expected because scene-clip reuse is requested."
          : "OpenRouter provider image-to-video is not expected because Ken Burns local rendering is selected.",
      estimatedCostUsd: 0,
    });
  }

  lineItems.push({
    id: "local_ken_burns",
    label: "Ken Burns scene clips",
    provider: "Local",
    reason:
      regeneratesSceneClips && renderMode === "ken_burns_ffmpeg"
        ? `Local Ken Burns FFmpeg generation is expected for ${sceneCount} scene clip(s), with no provider image-to-video charge.`
        : "Local Ken Burns scene clip generation is not expected for the selected render options.",
    estimatedCostUsd: 0,
  });

  const needsVoiceover =
    input.tourType === "tour_video_voice_over" ||
    input.tourType === "tour_video_avatar";
  const regeneratesVoiceover =
    needsVoiceover && shouldRegenerate(input.options, "voiceover");
  const estimatedVoiceoverCharacters =
    totalVideoSeconds *
    TOUR_PROVIDER_SPEND_PRICING.elevenLabsVoiceover.estimatedCharactersPerSecond;
  lineItems.push({
    id: "elevenlabs_voiceover",
    label: "Voiceover",
    provider: "ElevenLabs",
    reason: regeneratesVoiceover
      ? "ElevenLabs voiceover is expected because this tour type uses narration and voiceover reuse is off or this is a fresh run."
      : needsVoiceover
        ? "ElevenLabs voiceover is not expected because voiceover reuse is requested."
        : "ElevenLabs voiceover is not expected for non-voiceover tour videos.",
    estimatedCostUsd: regeneratesVoiceover
      ? estimatedVoiceoverCharacters *
        TOUR_PROVIDER_SPEND_PRICING.elevenLabsVoiceover.usdPerCharacter
      : 0,
  });

  const needsAvatar = input.tourType === "tour_video_avatar";
  const regeneratesAvatar =
    needsAvatar && shouldRegenerate(input.options, "avatar");
  lineItems.push({
    id: "heygen_avatar",
    label: "Avatar video",
    provider: "HeyGen",
    reason: regeneratesAvatar
      ? "HeyGen avatar generation is expected because this is an avatar tour and avatar reuse is off or this is a fresh run."
      : needsAvatar
        ? "HeyGen avatar generation is not expected because avatar reuse is requested."
        : "HeyGen avatar generation is not expected for this tour type.",
    estimatedCostUsd: regeneratesAvatar
      ? (totalVideoSeconds / 60) *
        TOUR_PROVIDER_SPEND_PRICING.heyGenAvatar.standardUsdPerMinute
      : 0,
  });

  const regeneratesFinalVideo = shouldRegenerate(input.options, "finalVideo");
  lineItems.push({
    id: "local_final_mux",
    label: "Final mux",
    provider: "Local",
    reason: regeneratesFinalVideo
      ? "Local final muxing is expected to stitch available clips, audio, and avatar assets with no provider charge."
      : "Local final muxing is not expected because final-video reuse is requested.",
    estimatedCostUsd: 0,
  });

  const estimatedTotalUsd = roundCents(
    lineItems.reduce((total, item) => total + item.estimatedCostUsd, 0),
  );
  const risk = riskForTotal(estimatedTotalUsd);

  return {
    risk,
    riskLabel: riskLabel(risk),
    estimatedTotalUsd,
    summary: `${formatTourProviderSpendUsd(
      estimatedTotalUsd,
    )} estimated - ${riskLabel(risk)}`,
    assumptions: {
      includedSceneCount: sceneCount,
      clipSeconds,
      renderMode,
      tourType: input.tourType,
      sceneClipProviderModelId:
        renderMode === "provider_image_to_video"
          ? getSceneClipProviderModelId(input.options)
          : null,
    },
    lineItems: lineItems.map((item) => ({
      ...item,
      estimatedCostUsd: roundCents(item.estimatedCostUsd),
    })),
  };
}
