export interface PromptPack {
  id: string;
  tier: string;
  size: number;
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;
}

export const PROMPT_PACKS: PromptPack[] = [
  {
    id: "pack_bronze",
    tier: "Bronze",
    size: 10,
    priceCents: 299,
    stripePriceId: "price_1TRiz2I38RnYMEg39YYu4KSW",
    label: "10 Prompts",
  },
  {
    id: "pack_silver",
    tier: "Silver",
    size: 25,
    priceCents: 599,
    stripePriceId: "price_1TRizOI38RnYMEg3QTo0xbgF",
    label: "25 Prompts",
  },
  {
    id: "pack_gold",
    tier: "Gold",
    size: 50,
    priceCents: 899,
    stripePriceId: "price_1TRizhI38RnYMEg3AKrzO157",
    label: "50 Prompts",
    bestValue: true,
  },
  {
    id: "pack_diamond",
    tier: "Diamond",
    size: 100,
    priceCents: 1999,
    stripePriceId: "price_1TRizyI38RnYMEg3d80wCtzb",
    label: "100 Prompts",
  },
];

export function getPackById(id: string): PromptPack | undefined {
  return PROMPT_PACKS.find((p) => p.id === id);
}
