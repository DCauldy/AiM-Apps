export type AimTier = "member" | "pro";

const PROMPT_STUDIO_LIMIT_BY_TIER: Record<AimTier, number> = {
  member: 25,
  pro: 25,
};

export function getPromptStudioLimitForTier(tier: AimTier | undefined): number {
  return PROMPT_STUDIO_LIMIT_BY_TIER[tier ?? "member"];
}
