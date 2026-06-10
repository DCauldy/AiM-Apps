// ============================================================
// CMA app packs — purchasable upgrades on top of Pro.
//
// (Internal slug "listing-studio" is preserved across the codebase to
// avoid migration churn. User-facing copy is "CMA" everywhere.)
//
// Billing meter: active_clients — clients currently enrolled in the
// automated cadence. Snapshot-based, not monthly-counter based: the
// enrollment-time atomic RPC `try_reserve_client_slot` counts live rows
// where enrolled = TRUE and either lets the enrollment through or
// blocks with reason "cap reached." Unenrolling immediately frees a slot.
//
// Soft guardrail: manualSendsPerMonth caps the "send now" override so
// agents can't bypass cadence by manually firing CMAs back-to-back.
// ============================================================

import { UNLIMITED, type PackLimit } from "@/lib/hyperlocal-packs";

export { UNLIMITED } from "@/lib/hyperlocal-packs";
export type { PackLimit } from "@/lib/hyperlocal-packs";

export interface ListingStudioPack {
  id: string;
  tier: string;
  activeClientsLimit: PackLimit;
  manualSendsPerMonth: PackLimit;
  priceCents: number;
  stripePriceId: string;
  /** Short marketing label, used on cards + dashboards. */
  label: string;
  /** Highlighted tier in the upgrade UI. */
  bestValue?: boolean;
}

/** Base CMA capacity included with every Pro subscription — no pack
 *  required. Tuned to "small past-client list" — enough to validate the
 *  product before an agent commits to a pack. */
export const LISTING_STUDIO_BASE: Pick<
  ListingStudioPack,
  "activeClientsLimit" | "manualSendsPerMonth"
> = {
  activeClientsLimit: 25,
  manualSendsPerMonth: 50,
};

export const LISTING_STUDIO_PACKS: ListingStudioPack[] = [
  {
    id: "listing_studio_bronze",
    tier: "Bronze",
    activeClientsLimit: 100,
    manualSendsPerMonth: 50,
    priceCents: 4900,
    stripePriceId: "price_TODO",
    label: "100 active clients · automated quarterly CMAs",
  },
  {
    id: "listing_studio_silver",
    tier: "Silver",
    activeClientsLimit: 250,
    manualSendsPerMonth: 50,
    priceCents: 9900,
    stripePriceId: "price_TODO",
    label: "250 active clients · automated quarterly CMAs",
  },
  {
    id: "listing_studio_gold",
    tier: "Gold",
    activeClientsLimit: 500,
    manualSendsPerMonth: 50,
    priceCents: 17900,
    stripePriceId: "price_TODO",
    label: "500 active clients · automated quarterly CMAs",
    bestValue: true,
  },
  {
    id: "listing_studio_diamond",
    tier: "Diamond",
    activeClientsLimit: UNLIMITED,
    manualSendsPerMonth: 50,
    priceCents: 29900,
    stripePriceId: "price_TODO",
    label: "Unlimited active clients (fair use)",
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
    activeClientsLimit: pack.activeClientsLimit,
    manualSendsPerMonth: pack.manualSendsPerMonth,
  };
}

/** Marketing tier label — "Pro" when no pack, otherwise the tier name. */
export function getListingStudioTierLabel(packId: string | null | undefined): string {
  if (!packId) return "Pro";
  const pack = getListingStudioPackById(packId);
  return pack?.tier ?? "Pro";
}
