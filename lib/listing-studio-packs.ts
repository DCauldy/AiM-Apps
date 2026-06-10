// ============================================================
// Listing Studio app packs — purchasable upgrades on top of Pro.
//
// Pro subscription includes 1 active listing/month + 10 prospect CMAs.
// Packs raise the active-listing cap (the primary billing meter); the
// prospect-CMA cap is a soft guardrail constant across most tiers.
//
// One billing meter: active_listings_promoted. The "promote prospect to
// active listing" action consumes one slot via the atomic
// try_reserve_active_listing_slot RPC. Pipeline failures refund.
//
// Soft cap: cmaSoftLimit applies across all tiers (Diamond included) to
// prevent abuse — "run a CMA for every house in the MLS" patterns.
// ============================================================

import { UNLIMITED, type PackLimit } from "@/lib/hyperlocal-packs";

export { UNLIMITED } from "@/lib/hyperlocal-packs";
export type { PackLimit } from "@/lib/hyperlocal-packs";

export interface ListingStudioPack {
  id: string;
  tier: string;
  activeListingsPerMonth: PackLimit;
  cmaSoftLimit: PackLimit;
  priceCents: number;
  stripePriceId: string;
  /** Short marketing label, used on cards + dashboards. */
  label: string;
  /** Highlighted tier in the upgrade UI. */
  bestValue?: boolean;
}

/** Base Listing Studio capacity included with every Pro subscription —
 *  no pack required. */
export const LISTING_STUDIO_BASE: Pick<
  ListingStudioPack,
  "activeListingsPerMonth" | "cmaSoftLimit"
> = {
  activeListingsPerMonth: 1,
  cmaSoftLimit: 10,
};

export const LISTING_STUDIO_PACKS: ListingStudioPack[] = [
  {
    id: "listing_studio_bronze",
    tier: "Bronze",
    activeListingsPerMonth: 3,
    cmaSoftLimit: 20,
    priceCents: 4900,
    stripePriceId: "price_TODO",
    label: "3 listings/mo · 20 prospect CMAs",
  },
  {
    id: "listing_studio_silver",
    tier: "Silver",
    activeListingsPerMonth: 6,
    cmaSoftLimit: 30,
    priceCents: 9900,
    stripePriceId: "price_TODO",
    label: "6 listings/mo · 30 prospect CMAs",
  },
  {
    id: "listing_studio_gold",
    tier: "Gold",
    activeListingsPerMonth: 10,
    cmaSoftLimit: 30,
    priceCents: 17900,
    stripePriceId: "price_TODO",
    label: "10 listings/mo · 30 prospect CMAs",
    bestValue: true,
  },
  {
    id: "listing_studio_diamond",
    tier: "Diamond",
    activeListingsPerMonth: UNLIMITED,
    cmaSoftLimit: 30,
    priceCents: 29900,
    stripePriceId: "price_TODO",
    label: "Unlimited listings · 30 prospect CMAs (fair use)",
  },
];

// ---------------------------------------------------------------------------
// Helpers — mirror the shape of hyperlocal-packs.ts / blog-packs.ts so
// call-sites can reuse the same lookup patterns across apps.
// ---------------------------------------------------------------------------

export function getListingStudioPackById(id: string): ListingStudioPack | undefined {
  return LISTING_STUDIO_PACKS.find((p) => p.id === id);
}

export function getListingStudioPackByTier(
  tier: string,
): ListingStudioPack | undefined {
  return LISTING_STUDIO_PACKS.find((p) => p.tier.toLowerCase() === tier.toLowerCase());
}

export function getListingStudioPackByPriceId(
  priceId: string,
): ListingStudioPack | undefined {
  return LISTING_STUDIO_PACKS.find((p) => p.stripePriceId === priceId);
}

/** Resolve the effective capacity for a user — pack limits if a pack
 *  is active, otherwise the base Pro allowances. */
export function getListingStudioCapacity(packId: string | null | undefined) {
  if (!packId) return LISTING_STUDIO_BASE;
  const pack = getListingStudioPackById(packId);
  if (!pack) return LISTING_STUDIO_BASE;
  return {
    activeListingsPerMonth: pack.activeListingsPerMonth,
    cmaSoftLimit: pack.cmaSoftLimit,
  };
}

/** Marketing tier label — "Pro" when no pack, otherwise the tier name. */
export function getListingStudioTierLabel(packId: string | null | undefined): string {
  if (!packId) return "Pro";
  const pack = getListingStudioPackById(packId);
  return pack?.tier ?? "Pro";
}
