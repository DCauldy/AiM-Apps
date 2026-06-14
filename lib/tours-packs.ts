// ============================================================
// Tours tier packs — Bronze / Silver / Gold / Diamond.
//
// Tier dial = tours rendered per month. Maps directly to the
// underlying AI rendering cost (image gen + voice + video stitch
// per scene). Customers understand "I get N finished tours/mo."
//
// Stripe price IDs are placeholders until products are created.
// Mirror Radar/Blog Engine pack shape so PackConfigTab + Stripe
// webhook can handle them with the existing scaffold.
// ============================================================

export const TOURS_INCLUDED_TIER = {
  id: "tours_included",
  tier: "Pro (included)",
  toursPerMonth: 1,
  priceCents: 0,
  label: "1 tour / mo",
};

export interface TourPack {
  id: string;
  tier: string;
  toursPerMonth: number;
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;
}

export const TOURS_PACKS: TourPack[] = [
  {
    id: "tours_bronze",
    tier: "Bronze",
    toursPerMonth: 2,
    priceCents: 2900,
    stripePriceId: "price_TODO",
    label: "2 tours / mo",
  },
  {
    id: "tours_silver",
    tier: "Silver",
    toursPerMonth: 5,
    priceCents: 5900,
    stripePriceId: "price_TODO",
    label: "5 tours / mo",
  },
  {
    id: "tours_gold",
    tier: "Gold",
    toursPerMonth: 12,
    priceCents: 9900,
    stripePriceId: "price_TODO",
    label: "12 tours / mo",
    bestValue: true,
  },
  {
    id: "tours_diamond",
    tier: "Diamond",
    toursPerMonth: 30,
    priceCents: 19900,
    stripePriceId: "price_TODO",
    label: "30 tours / mo",
  },
];

export function getToursPackById(id: string): TourPack | undefined {
  return TOURS_PACKS.find((p) => p.id === id);
}

export function getToursPackByTier(tier: string): TourPack | undefined {
  return TOURS_PACKS.find((p) => p.tier.toLowerCase() === tier.toLowerCase());
}

export function getToursPackByPriceId(priceId: string): TourPack | undefined {
  return TOURS_PACKS.find((p) => p.stripePriceId === priceId);
}

/** Friendly tier label from a pack id, defaulting to Pro-included
 *  when nothing is set (matches Radar / Blog Engine convention). */
export function getUserTierLabel(packId: string | null | undefined): string {
  if (!packId) return TOURS_INCLUDED_TIER.tier;
  const pack = getToursPackById(packId);
  return pack?.tier ?? TOURS_INCLUDED_TIER.tier;
}
