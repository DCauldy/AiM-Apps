/** Synchronous, env-based flags for client components (backward compat) */
export const FEATURES = {
  PROMPT_PACKS: process.env.NEXT_PUBLIC_ENABLE_PROMPT_PACKS === "true",
  BLOG_ENGINE: process.env.NEXT_PUBLIC_ENABLE_BLOG_ENGINE === "true",
  PROMPT_STUDIO: process.env.NEXT_PUBLIC_ENABLE_PROMPT_STUDIO !== "false",
  RADAR: process.env.NEXT_PUBLIC_ENABLE_RADAR === "true",
  HYPERLOCAL: process.env.NEXT_PUBLIC_ENABLE_HYPERLOCAL === "true",
  /** Map-first "Sphere" front door for Hyperlocal (vs. the legacy dashboard
   *  home). Ships dark until flipped so the proven flow stays default. */
  HYPERLOCAL_MAP_HOME:
    process.env.NEXT_PUBLIC_ENABLE_HYPERLOCAL_MAP_HOME === "true",
  LISTING_STUDIO: process.env.NEXT_PUBLIC_ENABLE_LISTING_STUDIO === "true",
  TOURS: process.env.NEXT_PUBLIC_ENABLE_TOURS !== "false",
} as const;
