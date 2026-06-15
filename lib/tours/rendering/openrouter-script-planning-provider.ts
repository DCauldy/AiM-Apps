import {
  normalizeTourScriptPlan,
  TourScriptPlanningError,
  type TourScriptPlan,
  type TourScriptPlanningProvider,
  type TourScriptPlanningProviderInput,
} from "./tour-script-planning";
import {
  RESOLVED_TOUR_SCENE_CAMERA_MOTIONS,
  TOUR_SCENE_CAMERA_MOTION_LABELS,
} from "@/lib/tours/scenes.core";

type OpenRouterTextContentPart = {
  type: "text";
  text: string;
};

type OpenRouterImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type OpenRouterContentPart = OpenRouterTextContentPart | OpenRouterImageContentPart;

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: unknown;
};

export type OpenRouterScriptPlanningProviderOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
  appInfo?: {
    referer?: string;
    title?: string;
  };
};

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export function createOpenRouterScriptPlanningProvider(
  options: OpenRouterScriptPlanningProviderOptions
): TourScriptPlanningProvider {
  return {
    async planScript(input) {
      if (!options.apiKey) {
        throw new TourScriptPlanningError(
          "OpenRouter API key is required for script planning.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      const response = await (options.fetcher ?? fetch)(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            options.appInfo?.referer ??
            process.env.NEXT_PUBLIC_APP_URL ??
            "https://apps.aimarketingacademy.com",
          "X-Title": options.appInfo?.title ?? "AiM Tours",
        },
        body: JSON.stringify({
          model: input.modelId,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You write concise spoken real-estate tour narration for ElevenLabs v3.",
                "Return only valid JSON.",
                "Use every supplied scene exactly once and keep the scene IDs unchanged.",
                "Each scene needs clean spokenText plus voicePromptText with sparse ElevenLabs v3 bracket tags.",
                "Keep user-supplied facts unchanged in meaning, but make the spoken wording polished.",
                "Do not say phrases like 'the tour moves into', 'next standout', 'start here', 'this scene', 'in this shot', or 'as we enter'.",
                "Do not create an image-to-video prompt.",
              ].join(" "),
            },
            {
              role: "user",
              content: buildOpenRouterContent(input, buildScriptPlanPrompt(input)),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new TourScriptPlanningError(
          `OpenRouter script planning failed with status ${response.status}.`,
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      const payload = (await response.json()) as OpenRouterChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new TourScriptPlanningError(
          "OpenRouter script planning response missing content.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      let parsed: Partial<TourScriptPlan>;
      try {
        parsed = JSON.parse(content) as Partial<TourScriptPlan>;
      } catch {
        throw new TourScriptPlanningError(
          "OpenRouter script planning response was not valid JSON.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      return normalizeTourScriptPlan({
        parsed,
        scenes: input.scenes,
        modelId: input.modelId,
        usage: payload.usage,
        timing: input.timing,
      });
    },
  };
}

function buildScriptPlanPrompt(input: TourScriptPlanningProviderInput): string {
  return [
    "Create a scene-ordered tour script plan for a photo-based real-estate tour.",
    `Return JSON shape: {"fullScript":"clean spoken narration only","voicePromptScript":"ElevenLabs v3 prompt text","sceneTimings":[{"sceneId":"...","spokenText":"...","voicePromptText":"[tag] ...","deliveryTags":["[tag]"],"selectedCameraMotion":"slow_push","durationSeconds":${input.timing.fallbackDurationSeconds}}]}.`,
    `durationSeconds must be between ${input.timing.minDurationSeconds} and ${input.timing.maxDurationSeconds}.`,
    `Prompt version: ${input.promptVersion}.`,
    "The final renderer will use each still image with camera motion, so write narration that works over a photo-based tour.",
    "Write buyer-facing narration only. Do not describe the tour mechanics or camera movement.",
    "Keep each scene to 1-2 short spoken sentences.",
    `Available concrete camera motions: ${formatResolvedCameraMotionOptions()}.`,
    "If a scene's cameraMotion is auto, inspect its image and set selectedCameraMotion to the best concrete motion for an Instagram real-estate hook.",
    "If a scene's cameraMotion is not auto, set selectedCameraMotion to that supplied concrete value.",
    "Choose motion based on composition: strong centered feature can use slow_push or snap_push, wide rooms can use slow_pan or hero_reveal, finishes can use detail_glide, tall foyers/stairs/windows/facades can use vertical_rise, and already-perfect compositions can use static_hold.",
    "",
    "ElevenLabs v3 delivery tags:",
    "- Add one short square-bracket tag at the start of each scene's voicePromptText.",
    "- Tags guide delivery; they are not spoken words.",
    "- Use richer but credible tags like [bright, confident real estate host], [with quiet excitement], [with a warm smile], [with subtle emphasis], [slower, premium, reassuring], [softly impressed], [light laugh, impressed], or [with confident warmth].",
    "- Prefer the energy of [bright, confident real estate host] and [with quiet excitement] over flat narration.",
    "- Avoid fake-sounding laughter, extreme excitement, XML tags, SSML, headings, labels, and prose instructions outside brackets.",
    "- voicePromptText must be spokenText with only delivery tags added; do not add facts or extra narration there.",
    "- fullScript must contain clean spoken words without bracket tags.",
    "- voicePromptScript must contain the tagged voicePromptText values joined in scene order.",
    "Do not include markdown, comments, labels, or text outside the JSON object.",
    "",
    "Property:",
    JSON.stringify(
      {
        id: input.project.id,
        name: input.project.name,
        propertyAddress: input.project.propertyAddress,
        listingUrl: input.project.listingUrl,
        tourType: input.project.tourType,
      },
      null,
      2
    ),
    "",
    "Scenes:",
    ...input.scenes.map((scene, index) => {
      const facts = scene.proofedFacts.length
        ? scene.proofedFacts.map((fact) => fact.text).join("; ")
        : "None";
      return [
        `${index + 1}. sceneId: ${scene.id}`,
        `title: ${scene.title}`,
        `cameraMotion: ${scene.cameraMotion}`,
        `facts: ${facts}`,
      ].join("\n");
    }),
  ].join("\n");
}

function formatResolvedCameraMotionOptions(): string {
  return RESOLVED_TOUR_SCENE_CAMERA_MOTIONS.map(
    (motion) => `${motion} (${TOUR_SCENE_CAMERA_MOTION_LABELS[motion]})`
  ).join(", ");
}

function buildOpenRouterContent(
  input: TourScriptPlanningProviderInput,
  prompt: string
): OpenRouterContentPart[] {
  const content: OpenRouterContentPart[] = [{ type: "text", text: prompt }];

  for (const [index, scene] of input.scenes.entries()) {
    content.push({ type: "text", text: `Scene ${index + 1}: ${scene.title} (${scene.id})` });
    if (isRemoteFetchableUrl(scene.imageUrl)) {
      content.push({ type: "image_url", image_url: { url: scene.imageUrl } });
    }
  }

  return content;
}

function isRemoteFetchableUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
