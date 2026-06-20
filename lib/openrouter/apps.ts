import type { OpenRouterAppInfo } from "./types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_REFERER = "https://apps.aimarketingacademy.com";

export const openRouterApps = {
  tours: {
    title: "AiM Tours",
    referer: OPENROUTER_REFERER,
  },
  blogEngine: {
    title: "AiM Blog Engine",
    referer: OPENROUTER_REFERER,
  },
  hyperlocal: {
    title: "AiM Hyperlocal",
    referer: OPENROUTER_REFERER,
  },
  listingStudio: {
    title: "AiM Listing Studio",
    referer: OPENROUTER_REFERER,
  },
  promptStudio: {
    title: "AiM Prompt Studio",
    referer: OPENROUTER_REFERER,
  },
  radar: {
    title: "AiM Radar",
    referer: OPENROUTER_REFERER,
  },
} satisfies Record<string, OpenRouterAppInfo>;
