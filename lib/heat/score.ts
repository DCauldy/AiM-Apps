// ============================================================
// Heat Score + Temperature — pure, deterministic, no I/O.
//
// Two modes:
//   • WITH a sold-comp baseline (preferred): scores are ABSOLUTE —
//     each active listing is judged against what actually sold in the
//     same ZIP + band over the last 90 days (views/day, DOM pace,
//     pricing discipline). This is what makes "🌋 Super Hot" mean
//     something rather than just "best of this list".
//   • WITHOUT a baseline (fallback): relative min-max within the set,
//     so the hottest still anchors at 100.
//
// Either way we emit a 0–100 score, a temperature tier, and badges.
// See HEAT_PLAN.md §2.
// ============================================================

import {
  DEFAULT_WEIGHTS,
  type HeatBadge,
  type HeatListing,
  type HeatWeights,
  type MarketBaseline,
  type ScoredListing,
  temperatureFor,
} from "./types";

const FRESH_WINDOW_DAYS = 60;
const STALE_DAYS = 60;
const CUT_DOM_CAP = 120;

// Absolute-mode reference points (used when the baseline lacks a value).
const REF_SAVE_RATE = 0.04; // ~typical saves-to-views
const REF_VIEWS_PER_DAY = 20;
const REF_DOM = 45;

// ---- small helpers -------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Saturating 0..1 map for a ratio where 1.0 (== reference) → 0.5. */
function saturate(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return ratio / (ratio + 1);
}

function minMaxNormalizer(values: number[]): (v: number) => number {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) return () => 0.5;
  return (v: number) => clamp((v - min) / span, 0, 1);
}

function median(nums: number[]): number {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function quantile(nums: number[], p: number): number {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const idx = clamp(Math.round(p * (xs.length - 1)), 0, xs.length - 1);
  return xs[idx];
}

// ---- raw component signals ----------------------------------------------

function savesToViews(l: HeatListing): number {
  return l.views > 0 ? l.saves / l.views : 0;
}

function viewsPerDay(l: HeatListing): number {
  return l.views / Math.max(l.daysOnMarket, 1);
}

function intentRaw(l: HeatListing): number {
  return savesToViews(l) * Math.log1p(l.saves);
}

function freshnessRaw(l: HeatListing): number {
  const freshness = Math.max(0, 1 - l.daysOnMarket / FRESH_WINDOW_DAYS);
  return savesToViews(l) * freshness;
}

function cutPenaltyRaw(l: HeatListing): number {
  const hasCut = (l.priceCutCount ?? 0) > 0 ? 0.5 : 0;
  const lingering = clamp(l.daysOnMarket / CUT_DOM_CAP, 0, 1) * 0.5;
  return hasCut + lingering;
}

// ---- badges -------------------------------------------------------------

function computeBadges(
  l: HeatListing,
  intentScore: number,
  ctx: { priceMedian: number; ratioQ75: number },
): HeatBadge[] {
  const badges: HeatBadge[] = [];
  const ratio = savesToViews(l);
  if (ratio >= ctx.ratioQ75 && l.price <= ctx.priceMedian) badges.push("deal-watch");
  if (l.daysOnMarket <= 14 && intentScore >= 0.6) badges.push("fresh-hot");
  if ((l.priceCutCount ?? 0) > 0 && l.daysOnMarket > STALE_DAYS) badges.push("cooling");
  return badges;
}

// ---- main ---------------------------------------------------------------

interface Scored {
  l: HeatListing;
  index: number; // 0..1
  comp: { intent: number; traffic: number; freshness: number; cutPenalty: number };
}

/** Absolute scoring against the sold-comp baseline. */
function scoreAbsolute(
  listings: HeatListing[],
  weights: HeatWeights,
  baseline: MarketBaseline,
): Scored[] {
  const refViewsPerDay = baseline.medianViewsPerDay || REF_VIEWS_PER_DAY;
  const refDom = baseline.medianDom || REF_DOM;
  const posSum = weights.intent + weights.traffic + weights.freshness || 1;

  return listings.map((l) => {
    const intent = saturate(savesToViews(l) / REF_SAVE_RATE);
    const traffic = saturate(viewsPerDay(l) / refViewsPerDay);
    // Pace: still fresh vs. already slower than what sold here.
    const pace = refDom / (refDom + l.daysOnMarket);
    const cut = cutPenaltyRaw(l);
    const positive =
      (weights.intent * intent + weights.traffic * traffic + weights.freshness * pace) /
      posSum;
    const index = clamp(positive - weights.cutPenalty * cut, 0, 1);
    return { l, index, comp: { intent, traffic, freshness: pace, cutPenalty: cut } };
  });
}

/** Relative scoring (min-max within the set); hottest anchors at 1.0. */
function scoreRelative(listings: HeatListing[], weights: HeatWeights): Scored[] {
  const normIntent = minMaxNormalizer(listings.map(intentRaw));
  const normTraffic = minMaxNormalizer(listings.map(viewsPerDay));
  const normFresh = minMaxNormalizer(listings.map(freshnessRaw));
  const normCut = minMaxNormalizer(listings.map(cutPenaltyRaw));

  const raw = listings.map((l) => {
    const intent = normIntent(intentRaw(l));
    const traffic = normTraffic(viewsPerDay(l));
    const freshness = normFresh(freshnessRaw(l));
    const cutPenalty = normCut(cutPenaltyRaw(l));
    const rawScore =
      weights.intent * intent +
      weights.traffic * traffic +
      weights.freshness * freshness -
      weights.cutPenalty * cutPenalty;
    return { l, rawScore, comp: { intent, traffic, freshness, cutPenalty } };
  });
  const topRaw = Math.max(...raw.map((r) => r.rawScore), 0);
  return raw.map((r) => ({
    l: r.l,
    index: topRaw > 0 ? clamp(r.rawScore / topRaw, 0, 1) : 0,
    comp: r.comp,
  }));
}

/**
 * Score + rank a set of listings. Pass a sold-comp `baseline` for absolute
 * temperature; omit it for relative-within-set ranking.
 */
export function scoreListings(
  listings: HeatListing[],
  opts: { weights?: HeatWeights; baseline?: MarketBaseline | null } = {},
): ScoredListing[] {
  if (listings.length === 0) return [];
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const baseline = opts.baseline ?? null;

  const priceMedian = median(listings.map((l) => l.price));
  const ratioQ75 = quantile(listings.map(savesToViews), 0.75);

  const scored = baseline
    ? scoreAbsolute(listings, weights, baseline)
    : scoreRelative(listings, weights);

  const out: ScoredListing[] = scored.map(({ l, index, comp }) => ({
    ...l,
    heatScore: Math.round(index * 100),
    temperature: temperatureFor(index),
    breakdown: {
      savesToViews: savesToViews(l),
      viewsPerDay: viewsPerDay(l),
      intent: comp.intent,
      traffic: comp.traffic,
      freshness: comp.freshness,
      cutPenalty: comp.cutPenalty,
    },
    badges: computeBadges(l, comp.intent, { priceMedian, ratioQ75 }),
    rank: 0,
  }));

  out.sort((a, b) => b.heatScore - a.heatScore);
  out.forEach((s, i) => {
    s.rank = i + 1;
  });
  return out;
}
