import {
  normalizeTourScriptPlan,
  TourScriptPlanningError,
  type TourScriptPlan,
  type TourScriptPlanningProvider,
  type TourScriptPlanningProviderInput,
} from "./tour-script-planning";

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
                "You write concise luxury real-estate tour narration.",
                "Return only valid JSON.",
                "Use every supplied scene exactly once and keep the scene IDs unchanged.",
                "Each scene needs scriptText that can stand alone as that scene's voiceover.",
                "Keep user-supplied facts unchanged in meaning, but make the spoken wording polished.",
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
    `Return JSON shape: {"fullScript":"...","sceneTimings":[{"sceneId":"...","scriptText":"...","durationSeconds":${input.timing.fallbackDurationSeconds}}]}.`,
    `durationSeconds must be between ${input.timing.minDurationSeconds} and ${input.timing.maxDurationSeconds}.`,
    `Prompt version: ${input.promptVersion}.`,
    "The final renderer will use each still image with camera motion, so write narration that works over a photo-based tour.",
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
