// ============================================================
// CMA adjustment grid — deterministic JS math, no AI.
//
// The grid is the audit trail behind the recommended price. Every comp
// runs through the same adjustment function with the same rules; the
// per-feature deltas are recorded on the AdjustedComp so the seller +
// internal memo can cite them and the agent can defend the math.
//
// Why constants live here, not config:
//   - Defaults match the appraiser conventions Cowork's prompt baked in
//   - If we ever surface per-user overrides they can flow through these
//     as named parameters; nothing else needs to change.
// ============================================================

import type {
  PropertyFacts,
  AdjustedComp,
  AdjustmentGridSummary,
} from "@/types/listing-studio";
import type { RawComp, CompsCriteria } from "@/lib/listing-studio/rapidapi";

// Per-feature default adjustments. Exported so prompt + UI can cite the
// values when explaining "$5k/bedroom" etc.
export const BED_ADJUSTMENT_CENTS = 500_000;       // $5,000 per bed delta
export const BATH_ADJUSTMENT_CENTS = 750_000;      // $7,500 per bath delta
export const GARAGE_ADJUSTMENT_CENTS = 500_000;    // $5,000 per garage space delta

/** sqft delta is monetized using the comp's own $/sqft (more honest
 *  than a market-wide constant — large luxury comps scale up, modest
 *  homes scale down). Falls back to 0 when comp price/sqft is missing. */
function compPricePerSqftCents(comp: RawComp): number {
  if (!comp.sold_price_cents || !comp.living_area_sqft || comp.living_area_sqft <= 0) {
    return 0;
  }
  return Math.round(comp.sold_price_cents / comp.living_area_sqft);
}

/** Sqft window for comp filtering — within ±20% of subject. */
export const SQFT_TOLERANCE = 0.2;

/** Year-built cap: max ±10% adjustment regardless of age delta. */
const YEAR_BUILT_CAP_PCT = 0.1;
/** 1% per decade. */
const YEAR_BUILT_RATE_PER_DECADE = 0.01;

// ---------------------------------------------------------------------------
// Filter pass — radius / recency / property type / sqft window.
// ---------------------------------------------------------------------------

export interface FilterCriteria {
  radius_mi: number;
  months_back: number;
  property_type: string | null;
  /** Subject sqft — if present, comps must be within ±20%. */
  subject_sqft: number | null;
}

export function filterComps(
  rawComps: RawComp[],
  subject: PropertyFacts,
  criteria: FilterCriteria,
): RawComp[] {
  const cutoffDate = monthsAgo(criteria.months_back);
  const sqftMin = criteria.subject_sqft
    ? criteria.subject_sqft * (1 - SQFT_TOLERANCE)
    : null;
  const sqftMax = criteria.subject_sqft
    ? criteria.subject_sqft * (1 + SQFT_TOLERANCE)
    : null;

  return rawComps.filter((comp) => {
    if (!comp.sold_price_cents || comp.sold_price_cents <= 0) return false;

    // Recency
    if (comp.sold_date) {
      const d = new Date(comp.sold_date);
      if (!Number.isNaN(d.getTime()) && d < cutoffDate) return false;
    }

    // Radius — only filter when provider returned a distance value.
    if (
      comp.distance_mi != null &&
      criteria.radius_mi > 0 &&
      comp.distance_mi > criteria.radius_mi
    ) {
      return false;
    }

    // Property type match — case-insensitive substring (provider strings vary).
    if (
      criteria.property_type &&
      comp.property_type &&
      !looselyMatchType(comp.property_type, criteria.property_type)
    ) {
      return false;
    }
    if (
      criteria.property_type &&
      !comp.property_type &&
      subject.property_type
    ) {
      // No type on comp — keep, the appraiser will decide downstream.
    }

    // Sqft window
    if (
      sqftMin != null &&
      sqftMax != null &&
      comp.living_area_sqft != null &&
      (comp.living_area_sqft < sqftMin || comp.living_area_sqft > sqftMax)
    ) {
      return false;
    }

    return true;
  });
}

function looselyMatchType(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

// ---------------------------------------------------------------------------
// Per-comp adjustment.
// ---------------------------------------------------------------------------

export function applyAdjustments(
  comp: RawComp,
  subject: PropertyFacts,
): AdjustedComp {
  const adjustments: AdjustedComp["adjustments"] = [];

  // Sqft delta — comp's own $/sqft applied to (subject_sqft - comp_sqft).
  if (
    subject.living_area_sqft != null &&
    comp.living_area_sqft != null &&
    comp.living_area_sqft > 0
  ) {
    const sqftDelta = subject.living_area_sqft - comp.living_area_sqft;
    if (sqftDelta !== 0) {
      const ppsf = compPricePerSqftCents(comp);
      const delta = Math.round(sqftDelta * ppsf);
      if (delta !== 0) {
        adjustments.push({
          feature: "living_area_sqft",
          delta_cents: delta,
          reason: `${sqftDelta > 0 ? "+" : ""}${sqftDelta.toLocaleString()} sqft vs comp @ $${(ppsf / 100).toFixed(0)}/sqft`,
        });
      }
    }
  }

  // Beds — flat $/bed.
  if (subject.beds != null && comp.beds != null) {
    const bedDelta = subject.beds - comp.beds;
    if (bedDelta !== 0) {
      adjustments.push({
        feature: "beds",
        delta_cents: bedDelta * BED_ADJUSTMENT_CENTS,
        reason: `${bedDelta > 0 ? "+" : ""}${bedDelta} bed vs comp`,
      });
    }
  }

  // Baths — flat $/bath; supports half-baths.
  if (subject.baths != null && comp.baths != null) {
    const bathDelta = subject.baths - comp.baths;
    if (bathDelta !== 0) {
      adjustments.push({
        feature: "baths",
        delta_cents: Math.round(bathDelta * BATH_ADJUSTMENT_CENTS),
        reason: `${bathDelta > 0 ? "+" : ""}${bathDelta} bath vs comp`,
      });
    }
  }

  // Lot — proportional to comp price by lot-size ratio, capped at ±10% of
  // comp price so a 5-acre outlier doesn't blow the grid.
  if (
    subject.lot_area_sqft != null &&
    comp.lot_area_sqft != null &&
    comp.lot_area_sqft > 0 &&
    comp.sold_price_cents != null
  ) {
    const lotDelta = subject.lot_area_sqft - comp.lot_area_sqft;
    if (lotDelta !== 0) {
      // Land value is roughly 15% of sold price as a rule of thumb.
      const compLandValue = comp.sold_price_cents * 0.15;
      const lotAdj = Math.round((lotDelta / comp.lot_area_sqft) * compLandValue);
      const capped = Math.max(
        Math.min(lotAdj, comp.sold_price_cents * 0.1),
        -comp.sold_price_cents * 0.1,
      );
      if (Math.round(capped) !== 0) {
        adjustments.push({
          feature: "lot_area_sqft",
          delta_cents: Math.round(capped),
          reason: `${lotDelta > 0 ? "+" : ""}${lotDelta.toLocaleString()} lot sqft vs comp`,
        });
      }
    }
  }

  // Garage — flat $/space.
  if (subject.garage_spaces != null && comp.garage_spaces != null) {
    const gDelta = subject.garage_spaces - comp.garage_spaces;
    if (gDelta !== 0) {
      adjustments.push({
        feature: "garage_spaces",
        delta_cents: gDelta * GARAGE_ADJUSTMENT_CENTS,
        reason: `${gDelta > 0 ? "+" : ""}${gDelta} garage spot vs comp`,
      });
    }
  }

  // Year built — 1% of comp price per decade delta, capped at 10%.
  if (
    subject.year_built != null &&
    comp.year_built != null &&
    comp.sold_price_cents != null
  ) {
    const yearDelta = subject.year_built - comp.year_built;
    if (yearDelta !== 0) {
      const ratePct = (yearDelta / 10) * YEAR_BUILT_RATE_PER_DECADE;
      const capped = Math.max(
        Math.min(ratePct, YEAR_BUILT_CAP_PCT),
        -YEAR_BUILT_CAP_PCT,
      );
      const yearAdj = Math.round(comp.sold_price_cents * capped);
      if (yearAdj !== 0) {
        adjustments.push({
          feature: "year_built",
          delta_cents: yearAdj,
          reason: `${yearDelta > 0 ? "+" : ""}${yearDelta} yr newer vs comp (capped ±10%)`,
        });
      }
    }
  }

  const total = adjustments.reduce((sum, a) => sum + a.delta_cents, 0);
  const adjusted = (comp.sold_price_cents ?? 0) + total;

  return {
    address: comp.address,
    zip: comp.zip,
    beds: comp.beds,
    baths: comp.baths,
    living_area_sqft: comp.living_area_sqft,
    lot_area_sqft: comp.lot_area_sqft,
    year_built: comp.year_built,
    property_type: comp.property_type,
    sold_price_cents: comp.sold_price_cents,
    sold_date: comp.sold_date,
    distance_mi: comp.distance_mi,
    adjustments,
    total_adjustment_cents: total,
    adjusted_value_cents: adjusted,
  };
}

// ---------------------------------------------------------------------------
// Grid summary + price recommendation.
// ---------------------------------------------------------------------------

export function summarizeGrid(
  adjustedComps: AdjustedComp[],
  criteria: FilterCriteria,
): AdjustmentGridSummary {
  const values = adjustedComps
    .map((c) => c.adjusted_value_cents)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);

  const count = values.length;
  if (count === 0) {
    return {
      comp_count: 0,
      median_adjusted_value_cents: 0,
      mean_adjusted_value_cents: 0,
      top_tertile_mean_cents: 0,
      criteria: {
        radius_mi: criteria.radius_mi,
        months_back: criteria.months_back,
        property_type: criteria.property_type,
        sqft_range: criteria.subject_sqft
          ? {
              min: Math.round(criteria.subject_sqft * (1 - SQFT_TOLERANCE)),
              max: Math.round(criteria.subject_sqft * (1 + SQFT_TOLERANCE)),
            }
          : null,
      },
    };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = Math.round(sum / count);

  // Median (linear interpolation for even counts).
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 0
      ? Math.round((values[mid - 1] + values[mid]) / 2)
      : values[mid];

  // Top tertile = top third of sorted values; mean over that subset.
  const tertileStart = Math.floor((count * 2) / 3);
  const topSlice = values.slice(tertileStart);
  const topMean =
    topSlice.length > 0
      ? Math.round(topSlice.reduce((a, b) => a + b, 0) / topSlice.length)
      : mean;

  return {
    comp_count: count,
    median_adjusted_value_cents: median,
    mean_adjusted_value_cents: mean,
    top_tertile_mean_cents: topMean,
    criteria: {
      radius_mi: criteria.radius_mi,
      months_back: criteria.months_back,
      property_type: criteria.property_type,
      sqft_range: criteria.subject_sqft
        ? {
            min: Math.round(criteria.subject_sqft * (1 - SQFT_TOLERANCE)),
            max: Math.round(criteria.subject_sqft * (1 + SQFT_TOLERANCE)),
          }
        : null,
    },
  };
}

export interface PriceRecommendation {
  appraised_value_cents: number;
  marketable_value_cents: number;
  recommended_price_cents: number;
}

/**
 * Bias toward the marketable (top-tertile) value — listing agents tend to
 * price aspirational, then adjust down. 60/40 weight is the Cowork prompt
 * default; live tunable here.
 */
export function recommendPrice(
  summary: AdjustmentGridSummary,
): PriceRecommendation {
  const appraised = summary.median_adjusted_value_cents;
  const marketable = summary.top_tertile_mean_cents;
  const recommended = Math.round(marketable * 0.6 + appraised * 0.4);
  return {
    appraised_value_cents: appraised,
    marketable_value_cents: marketable,
    recommended_price_cents: recommended,
  };
}

// ---------------------------------------------------------------------------
// Convenience — used by the route handler when echoing the criteria.
// ---------------------------------------------------------------------------

export function compsCriteriaFromInput(input: {
  zpid: string;
  zip?: string;
  radius_mi?: number;
  months_back?: number;
  property_type?: string;
  subject_sqft?: number;
}): CompsCriteria {
  return {
    zpid: input.zpid,
    zip: input.zip,
    radius_mi: input.radius_mi ?? 1,
    months_back: input.months_back ?? 6,
    property_type: input.property_type,
    subject_sqft: input.subject_sqft,
  };
}
