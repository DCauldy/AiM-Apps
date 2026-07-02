/** Synchronous, env-based flags for client components (backward compat) */
export const FEATURES = {
  PROMPT_PACKS: process.env.NEXT_PUBLIC_ENABLE_PROMPT_PACKS === "true",
  BLOG_ENGINE: process.env.NEXT_PUBLIC_ENABLE_BLOG_ENGINE === "true",
  PROMPT_STUDIO: process.env.NEXT_PUBLIC_ENABLE_PROMPT_STUDIO !== "false",
  RADAR: process.env.NEXT_PUBLIC_ENABLE_RADAR === "true",
  HYPERLOCAL: process.env.NEXT_PUBLIC_ENABLE_HYPERLOCAL === "true",
  LISTING_STUDIO: process.env.NEXT_PUBLIC_ENABLE_LISTING_STUDIO === "true",
  TOURS: process.env.NEXT_PUBLIC_ENABLE_TOURS !== "false",
  HEAT: process.env.NEXT_PUBLIC_ENABLE_HEAT === "true",
} as const;
