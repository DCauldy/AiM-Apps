import {
  normalizeTourScriptPlan,
  TourScriptPlanningError,
  type TourScriptPlan,
  type TourScriptPlanningProvider,
  type TourScriptPlanningProviderInput,
} from "../generation/tour-script-planning";
import {
  buildOpenRouterScriptPlanPrompt,
  buildOpenRouterScriptPlanSystemPrompt,
} from "./openrouter-script-planning-prompts";
import { openRouterApps } from "@/lib/openrouter/apps";
import { createOpenRouterClient } from "@/lib/openrouter/client";
import { isOpenRouterError } from "@/lib/openrouter/errors";
import type { OpenRouterChatJsonResult, OpenRouterContentPart } from "@/lib/openrouter/types";

export type OpenRouterScriptPlanningProviderOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
  appInfo?: {
    referer?: string;
    title?: string;
  };
};

export {
  buildOpenRouterScriptPlanPrompt,
  buildOpenRouterScriptPlanSystemPrompt,
} from "./openrouter-script-planning-prompts";

export function createOpenRouterScriptPlanningProvider(
  options: OpenRouterScriptPlanningProviderOptions
): TourScriptPlanningProvider {
  const client = createOpenRouterClient({
    apiKey: options.apiKey,
    fetcher: options.fetcher,
    app: {
      title: options.appInfo?.title ?? openRouterApps.tours.title,
      referer: options.appInfo?.referer ?? openRouterApps.tours.referer,
    },
  });

  return {
    async planScript(input) {
      if (!options.apiKey) {
        throw new TourScriptPlanningError(
          "OpenRouter API key is required for script planning.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      let result: OpenRouterChatJsonResult<Partial<TourScriptPlan>>;
      try {
        result = await client.chat.json<Partial<TourScriptPlan>>({
          operation: "tour.script.plan",
          model: input.modelId,
          messages: [
            {
              role: "system",
              content: buildOpenRouterScriptPlanSystemPrompt(),
            },
            {
              role: "user",
              content: buildOpenRouterContent(
                input,
                buildOpenRouterScriptPlanPrompt(input),
              ),
            },
          ],
        });
      } catch (error) {
        throw new TourScriptPlanningError(
          isOpenRouterError(error)
            ? error.message
            : "OpenRouter script planning failed.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      return normalizeTourScriptPlan({
        parsed: result.value,
        scenes: input.scenes,
        modelId: input.modelId,
        usage: result.usage,
        timing: input.timing,
      });
    },
  };
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
