// ============================================================
// Heat — shared types.
//
// A "listing" here is the normalized shape the Heat Score consumes,
// distilled from the RapidAPI us-housing-market-data payloads:
//   - search (propertyExtendedSearch) gives price/beds/DOM/img
//   - detail (/property, called by property_url) gives the demand
//     signals we care about: pageViewCount (views) + favoriteCount (saves)
// ============================================================

/** Normalized listing the scorer operates on (source-agnostic). */
export interface HeatListing {
  zpid: string;
  address: string;
  price: number;
  beds?: number | null;
  baths?: number | null;
  livingArea?: number | null;
  /** Days on market (Zillow's daysOnZillow). */
  daysOnMarket: number;
  /** pageViewCount from the detail payload. */
  views: number;
  /** favoriteCount from the detail payload. */
  saves: number;
  /** How many downward price changes the listing has had. */
  priceCutCount?: number;
  propertyType?: string;
  imgSrc?: string | null;
  detailUrl?: string | null;
}

/** Weightings for the four v1 Heat Score components (velocity comes in v2). */
export interface HeatWeights {
  intent: number;
  traffic: number;
  freshness: number;
  cutPenalty: number;
}

/** Recommended v1 defaults — Magic mode uses these; Control mode can override. */
export const DEFAULT_WEIGHTS: HeatWeights = {
  intent: 0.45,
  traffic: 0.25,
  freshness: 0.2,
  cutPenalty: 0.1,
};

/** Per-component contributions (post-normalization, pre-weight) for the "why hot" view. */
export interface ScoreBreakdown {
  /** saves ÷ views — committed-interest ratio. */
  savesToViews: number;
  /** views ÷ days-on-market. */
  viewsPerDay: number;
  /** Normalized 0..1 component values that fed the score. */
  intent: number;
  traffic: number;
  freshness: number;
  cutPenalty: number;
}

export type HeatBadge = "deal-watch" | "fresh-hot" | "cooling" | "surging";

/** Absolute temperature tiers — the headline judgment. */
export type Temperature = "super-hot" | "hot" | "cool" | "cold" | "ice-cold";

export const TEMPERATURE_META: Record<
  Temperature,
  { label: string; emoji: string; min: number }
> = {
  "super-hot": { label: "Super Hot", emoji: "🌋", min: 0.8 },
  hot: { label: "Hot", emoji: "🔥", min: 0.6 },
  cool: { label: "Cool", emoji: "🌤️", min: 0.4 },
  cold: { label: "Cold", emoji: "🥶", min: 0.2 },
  "ice-cold": { label: "Ice Cold", emoji: "🧊", min: 0 },
};

/** Map a 0..1 index to a temperature tier. */
export function temperatureFor(index: number): Temperature {
  if (index >= 0.8) return "super-hot";
  if (index >= 0.6) return "hot";
  if (index >= 0.4) return "cool";
  if (index >= 0.2) return "cold";
  return "ice-cold";
}

/**
 * Market baseline from recently-sold comps (last ~90 days) in the same
 * ZIP + price band. Gives the Heat Score an ABSOLUTE reference —
 * "hot vs. what actually sold here" — instead of only ranking within
 * the active set.
 */
export interface MarketBaseline {
  n: number;
  medianDom: number | null;
  /** sold ÷ list, e.g. 0.98 = sells 2% under ask. */
  medianListToSp: number | null;
  /** fraction of sold comps that cut price (0..1). */
  pctWithCuts: number | null;
  /** typical lifetime views ÷ day-on-market for sold comps. */
  medianViewsPerDay: number | null;
  medianSoldPrice: number | null;
}

export interface ScoredListing extends HeatListing {
  /** 0..100. Absolute vs. the sold baseline when available, else relative. */
  heatScore: number;
  /** Headline temperature tier. */
  temperature: Temperature;
  breakdown: ScoreBreakdown;
  badges: HeatBadge[];
  rank: number;
}
