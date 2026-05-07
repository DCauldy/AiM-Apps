export interface RadarPack {
  id: string;
  tier: string;
  queryLimit: number;
  manualChecksLimit: number;
  auditsLimit: number;
  monitoringFrequency: "monthly" | "weekly";
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;
}

export const RADAR_PACKS: RadarPack[] = [
  {
    id: "radar_silver",
    tier: "Silver",
    queryLimit: 50,
    manualChecksLimit: 5,
    auditsLimit: 2,
    monitoringFrequency: "monthly",
    priceCents: 2900,
    stripePriceId: "price_TODO",
    label: "50 queries, 5 checks/mo",
  },
  {
    id: "radar_gold",
    tier: "Gold",
    queryLimit: 100,
    manualChecksLimit: 15,
    auditsLimit: 5,
    monitoringFrequency: "weekly",
    priceCents: 9900,
    stripePriceId: "price_TODO",
    label: "100 queries, weekly monitoring",
    bestValue: true,
  },
  {
    id: "radar_platinum",
    tier: "Platinum",
    queryLimit: 200,
    manualChecksLimit: 50,
    auditsLimit: 10,
    monitoringFrequency: "weekly",
    priceCents: 14900,
    stripePriceId: "price_TODO",
    label: "200 queries, 50 checks/mo",
  },
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
