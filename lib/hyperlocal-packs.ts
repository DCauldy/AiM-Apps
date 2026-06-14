// ============================================================
// Hyperlocal app packs — purchasable upgrades on top of Pro.
//
// Pro subscription includes the base Hyperlocal experience (see
// HYPERLOCAL_BASE below). Packs are stackable upgrades that
// replace each other (one pack active at a time, like Blog Engine).
//
// Four meters:
//   - campaignsPerMonth      — how many runs can be kicked off
//   - segmentsPerCampaign    — max segments per run (AI cost driver)
//   - mlsHistoryMonths       — how far back snapshots are retained,
//                              drives YoY/multi-year trend language
//   - aiChatEditsPerDraft    — refine-via-chat turns per draft
//
// Pricing rationale: each tier doubles capacity vs. the prior, so
// per-unit cost trends down as the agent commits more. Diamond is
// the "all-you-can-eat" tier with soft fair-use caps.
// ============================================================

/** Sentinel for "no enforced limit" — UI renders as "Unlimited". */
export const UNLIMITED = -1;

export type PackLimit = number | typeof UNLIMITED;

export interface HyperlocalPack {
  id: string;
  tier: string;
  campaignsPerMonth: PackLimit;
  segmentsPerCampaign: PackLimit;
  mlsHistoryMonths: PackLimit;
  aiChatEditsPerDraft: PackLimit;
  priceCents: number;
  stripePriceId: string;
  /** Short marketing label, used on cards + dashboards. */
  label: string;
  /** Highlighted tier in the upgrade UI. */
  bestValue?: boolean;
}

/** Base Hyperlocal capacity included with every Pro subscription —
 *  no pack required. Used as the default ceiling when no pack is
 *  active and as the comparison baseline in upsell modals. */
export const HYPERLOCAL_BASE: Pick<
  HyperlocalPack,
  | "campaignsPerMonth"
  | "segmentsPerCampaign"
  | "mlsHistoryMonths"
  | "aiChatEditsPerDraft"
> = {
  campaignsPerMonth: 4,
  segmentsPerCampaign: 5,
  mlsHistoryMonths: 6,
  aiChatEditsPerDraft: 10,
};

export const HYPERLOCAL_PACKS: HyperlocalPack[] = [
  {
    id: "hyperlocal_bronze",
    tier: "Bronze",
    campaignsPerMonth: 8,
    segmentsPerCampaign: 10,
    mlsHistoryMonths: 12,
    aiChatEditsPerDraft: 20,
    priceCents: 3900,
    stripePriceId: "price_TODO",
    label: "8 campaigns/mo · 10 segments · 12mo MLS",
  },
  {
    id: "hyperlocal_silver",
    tier: "Silver",
    campaignsPerMonth: 16,
    segmentsPerCampaign: 20,
    mlsHistoryMonths: 24,
    aiChatEditsPerDraft: 50,
    priceCents: 7900,
    stripePriceId: "price_TODO",
    label: "16 campaigns/mo · 20 segments · 24mo MLS",
  },
  {
    id: "hyperlocal_gold",
    tier: "Gold",
    campaignsPerMonth: 32,
    segmentsPerCampaign: 30,
    mlsHistoryMonths: 36,
    aiChatEditsPerDraft: 100,
    priceCents: 12900,
    stripePriceId: "price_TODO",
    label: "32 campaigns/mo · 30 segments · 36mo MLS",
    bestValue: true,
  },
  {
    id: "hyperlocal_diamond",
    tier: "Diamond",
    campaignsPerMonth: 64,
    segmentsPerCampaign: 50,
    mlsHistoryMonths: UNLIMITED,
    aiChatEditsPerDraft: UNLIMITED,
    priceCents: 22900,
    stripePriceId: "price_TODO",
    label: "64 campaigns/mo · 50 segments · unlimited MLS history",
  },
];

// ---------------------------------------------------------------------------
// Helpers — mirror the shape of blog-packs.ts so call-sites can reuse the
// same lookup patterns across both apps.
// ---------------------------------------------------------------------------

export function getHyperlocalPackById(id: string): HyperlocalPack | undefined {
  return HYPERLOCAL_PACKS.find((p) => p.id === id);
}

export function getHyperlocalPackByTier(
  tier: string,
): HyperlocalPack | undefined {
  return HYPERLOCAL_PACKS.find((p) => p.tier.toLowerCase() === tier.toLowerCase());
}

export function getHyperlocalPackByPriceId(
  priceId: string,
): HyperlocalPack | undefined {
  return HYPERLOCAL_PACKS.find((p) => p.stripePriceId === priceId);
}

/** Resolve the effective capacity for a user — pack limits if a pack
 *  is active, otherwise the base Pro allowances. */
export function getHyperlocalCapacity(packId: string | null | undefined) {
  if (!packId) return HYPERLOCAL_BASE;
  const pack = getHyperlocalPackById(packId);
  if (!pack) return HYPERLOCAL_BASE;
  return {
    campaignsPerMonth: pack.campaignsPerMonth,
    segmentsPerCampaign: pack.segmentsPerCampaign,
    mlsHistoryMonths: pack.mlsHistoryMonths,
    aiChatEditsPerDraft: pack.aiChatEditsPerDraft,
  };
}

/** Marketing tier label — "Free" when no pack, otherwise the tier name. */
export function getHyperlocalTierLabel(packId: string | null | undefined): string {
  if (!packId) return "Pro";
  const pack = getHyperlocalPackById(packId);
  return pack?.tier ?? "Pro";
}

/** UI helper — render a limit as "Unlimited" or its number. */
export function formatPackLimit(limit: PackLimit): string {
  return limit === UNLIMITED ? "Unlimited" : limit.toLocaleString();
}

/** Guard — true when a numeric limit has been reached. Unlimited always passes. */
export function isWithinLimit(limit: PackLimit, current: number): boolean {
  if (limit === UNLIMITED) return true;
  return current < limit;
}
