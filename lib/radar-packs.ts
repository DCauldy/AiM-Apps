// ============================================================
// Radar tier packs — Bronze / Silver / Gold / Diamond.
//
// Each tier maps to:
//   - prompts:    how many tracking prompts in the brand report
//                 (the primary dial — drives Otterly's prompt quota)
//   - competitors: how many competitor brands tracked alongside
//   - audits:     monthly content-check budget (GEO-readiness audits)
//   - refresh:    how often Otterly re-runs prompts (depends on the
//                 underlying Otterly plan; weekly on Lite/Standard,
//                 daily/2x on Premium)
//
// Stripe price IDs are placeholders until the products are created.
// Stripe webhook (app/api/webhooks/stripe/route.ts) + admin-config
// already reference RADAR_PACKS by id.
// ============================================================

// Baseline allocation included with AiM Pro membership — what every
// Pro user gets at no extra cost. Sits BELOW the paid pack ladder
// (Bronze and up are paid upgrades). Mirrors how blog-packs handles
// "Pro included = 3 blogs/wk" implicit baseline.
export const RADAR_INCLUDED_TIER = {
  id: "radar_included",
  tier: "Pro (included)",
  prompts: 5,
  competitors: 3,
  auditsPerMonth: 10,
  refreshFrequency: "weekly" as const,
  priceCents: 0,
  label: "5 prompts · weekly",
};

export interface RadarPack {
  id: string;
  tier: string;
  prompts: number;
  competitors: number;
  auditsPerMonth: number;
  refreshFrequency: "weekly" | "daily" | "twice_daily";
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;

  // Legacy fields — kept for backward compat with the Stripe webhook
  // + admin-config DB columns (query_limit, manual_checks_limit,
  // audits_limit, monitoring_frequency). New code should read the
  // fields above; these get derived from those.
  queryLimit: number;
  manualChecksLimit: number;
  auditsLimit: number;
  monitoringFrequency: "monthly" | "weekly";
}

function pack(
  base: Omit<
    RadarPack,
    | "queryLimit"
    | "manualChecksLimit"
    | "auditsLimit"
    | "monitoringFrequency"
  >,
): RadarPack {
  // Derive legacy fields from the modern ones. queryLimit ~= prompts *
  // engines per refresh — we assume 4 engines (ChatGPT, Perplexity,
  // Gemini, Claude) as a reasonable default.
  return {
    ...base,
    queryLimit: base.prompts * 4,
    manualChecksLimit: base.auditsPerMonth,
    auditsLimit: base.auditsPerMonth,
    monitoringFrequency: base.refreshFrequency === "weekly" ? "weekly" : "weekly",
  };
}

export const RADAR_PACKS: RadarPack[] = [
  pack({
    id: "radar_bronze",
    tier: "Bronze",
    prompts: 5,
    competitors: 3,
    auditsPerMonth: 10,
    refreshFrequency: "weekly",
    priceCents: 2900,
    stripePriceId: "price_TODO",
    label: "5 prompts · weekly",
  }),
  pack({
    id: "radar_silver",
    tier: "Silver",
    prompts: 12,
    competitors: 5,
    auditsPerMonth: 25,
    refreshFrequency: "daily",
    priceCents: 5900,
    stripePriceId: "price_TODO",
    label: "12 prompts · daily",
  }),
  pack({
    id: "radar_gold",
    tier: "Gold",
    prompts: 25,
    competitors: 8,
    auditsPerMonth: 50,
    refreshFrequency: "daily",
    priceCents: 9900,
    stripePriceId: "price_TODO",
    label: "25 prompts · daily",
    bestValue: true,
  }),
  pack({
    id: "radar_diamond",
    tier: "Diamond",
    prompts: 50,
    competitors: 12,
    auditsPerMonth: 150,
    refreshFrequency: "twice_daily",
    priceCents: 19900,
    stripePriceId: "price_TODO",
    label: "50 prompts · twice daily",
  }),
];

export function getRadarPackById(id: string): RadarPack | undefined {
  return RADAR_PACKS.find((p) => p.id === id);
}

export function getRadarPackByTier(tier: string): RadarPack | undefined {
  return RADAR_PACKS.find((p) => p.tier.toLowerCase() === tier.toLowerCase());
}

export function getRadarPackByPriceId(priceId: string): RadarPack | undefined {
  return RADAR_PACKS.find((p) => p.stripePriceId === priceId);
}

/** Friendly tier label from a tier id, with Bronze as the default
 *  for users on the Pro-included starter allocation. */
export function getUserTierLabel(packId: string | null | undefined): string {
  if (!packId) return "Bronze";
  const pack = getRadarPackById(packId);
  return pack?.tier ?? "Bronze";
}
