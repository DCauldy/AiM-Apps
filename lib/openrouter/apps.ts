import type { OpenRouterAppInfo } from "./types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Legacy shared referer — kept for backward-compatible re-export only. New
// attribution uses per-app subdomains (see appReferer below).
export const OPENROUTER_REFERER = "https://apps.aimarketingacademy.com";

// OpenRouter buckets the dashboard "App" by referer HOST and folds sub-paths of
// an already-registered host into that one app — so distinct PATHS under
// apps.aimarketingacademy.com all collapse into a single entry. A distinct HOST
// is the only reliable separator: each app gets its own subdomain so it shows as
// its own app. These subdomains are attribution-only labels and need not resolve
// (same pattern as the Support app's support.aimarketingacademy.com).
export function appReferer(slug: string): string {
  return `https://${slug}.aimarketingacademy.com`;
}

export const openRouterApps = {
  tours: {
    title: "AiM Tours",
    referer: appReferer("tours"),
  },
  blogEngine: {
    title: "AiM Blog Engine",
    referer: appReferer("blog-engine"),
  },
  hyperlocal: {
    title: "AiM Hyperlocal",
    referer: appReferer("hyperlocal"),
  },
  listingStudio: {
    title: "AiM CMAs",
    referer: appReferer("cmas"),
  },
  promptStudio: {
    title: "AiM Prompt Studio",
    referer: appReferer("prompt-studio"),
  },
  radar: {
    title: "AiM Radar",
    referer: appReferer("radar"),
  },
} satisfies Record<string, OpenRouterAppInfo>;
