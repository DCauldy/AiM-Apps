import { createOpenAI } from "@ai-sdk/openai";
import { OPENROUTER_BASE_URL } from "./apps";
import { createOpenRouterFetch } from "./headers";
import type { OpenRouterClientOptions } from "./types";

export function createOpenRouterAiSdkProvider(options: OpenRouterClientOptions) {
  return createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl ?? OPENROUTER_BASE_URL,
    fetch: createOpenRouterFetch({
      apiKey: options.apiKey,
      app: options.app,
      fetcher: options.fetcher,
    }),
  });
}
