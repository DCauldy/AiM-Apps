export interface BlogPack {
  id: string;
  tier: string;
  frequency: number;
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;
}

export const BLOG_PACKS: BlogPack[] = [
  {
    id: "blog_bronze",
    tier: "Bronze",
    frequency: 4,
    priceCents: 3900,
    stripePriceId: "price_TODO",
    label: "4x / week",
  },
  {
    id: "blog_silver",
    tier: "Silver",
    frequency: 5,
    priceCents: 5900,
    stripePriceId: "price_TODO",
    label: "5x / week",
  },
  {
    id: "blog_gold",
    tier: "Gold",
    frequency: 6,
    priceCents: 7900,
    stripePriceId: "price_TODO",
    label: "6x / week",
    bestValue: true,
  },
  {
    id: "blog_diamond",
    tier: "Diamond",
    frequency: 7,
    priceCents: 10900,
    stripePriceId: "price_TODO",
    label: "7x / week (daily)",
  },
];

export function getBlogPackById(id: string): BlogPack | undefined {
  return BLOG_PACKS.find((p) => p.id === id);
}

export function getBlogPackByFrequency(frequency: number): BlogPack | undefined {
  return BLOG_PACKS.find((p) => p.frequency === frequency);
}

export function getBlogPackByPriceId(priceId: string): BlogPack | undefined {
  return BLOG_PACKS.find((p) => p.stripePriceId === priceId);
}

export function getUserTierLabel(frequency: number): string {
  if (frequency <= 3) return "Free";
  const pack = getBlogPackByFrequency(frequency);
  return pack?.tier ?? "Free";
}
