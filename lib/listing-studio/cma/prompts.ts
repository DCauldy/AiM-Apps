// ============================================================
// CMA narrative + memo prompts.
//
// Two outputs from a single grid:
//   - seller_narrative_md:  conversational, persuasive, lands the price
//   - internal_memo_md:     terse, defensive, lists risks the agent
//                           should be ready to address
//
// COMPLIANCE_PREAMBLE is exported and reused by the other Listing Studio
// slices (description, DOTW, HTML email) so guardrails stay identical
// across every Claude call.
// ============================================================

import type {
  PropertyFacts,
  AdjustedComp,
  AdjustmentGridSummary,
} from "@/types/listing-studio";
import type { MarketTrends } from "@/lib/listing-studio/rapidapi";
import {
  BED_ADJUSTMENT_CENTS,
  BATH_ADJUSTMENT_CENTS,
  GARAGE_ADJUSTMENT_CENTS,
  type PriceRecommendation,
} from "@/lib/listing-studio/cma/adjustment-grid";

/**
 * Compliance preamble injected into every Listing Studio prompt. Real
 * estate has hard legal lines (Fair Housing, RESPA, MLS rules) — these
 * are framed as instructions to Claude, not just hints, so the model
 * refuses to write the offending phrasing in the first place. Layer 2
 * (the Haiku validator) is a backstop.
 */
export const COMPLIANCE_PREAMBLE = `COMPLIANCE GUARDRAILS — these are non-negotiable rules. If you violate any of these the output is unusable and must be regenerated.

Fair Housing (federal + state):
- DO NOT mention or imply protected classes: race, color, religion, national origin, sex, familial status, disability, gender identity, sexual orientation, age, source of income, marital status, veteran status.
- DO NOT use coded language for the above: "family-friendly", "good neighborhood", "safe area", "quiet street with families", "perfect for empty-nesters", "great for young professionals", "diverse community", "ethnic", etc.
- DO NOT describe a neighborhood's people. Describe physical features only (proximity to parks, walkability of streets, lot sizes).
- DO NOT name or rate schools by quality ("top-rated schools", "great schools"). It is acceptable to state proximity ("0.4 mi to Lincoln Elementary") without rating.

RESPA (anti-kickback):
- DO NOT recommend lenders, title companies, inspectors, or any settlement-service provider.
- DO NOT mention financing partnerships, "preferred lender" arrangements, or rate buy-down promotions tied to specific lenders.

MLS rules:
- DO NOT include the agent's phone, email, brokerage URL, social handles, or any contact info inside MLS Public Remarks fields.
- DO NOT include the listing's open-house schedule inside the description body (separate field).

Tone:
- Write for a sophisticated audience — sellers and their advisors. Avoid hype words ("stunning", "must-see", "won't last", "priced to sell"). Earn the reader's trust with specifics.`;

// ---------------------------------------------------------------------------
// Shared input shape for both CMA prompts
// ---------------------------------------------------------------------------

export interface CmaPromptInput {
  /** Subject property address as the agent entered it. */
  address: string;
  subject: PropertyFacts;
  /** The merged + filtered comps with per-feature adjustments. */
  comps: AdjustedComp[];
  /** The grid math summary that produced the price recommendations. */
  grid: AdjustmentGridSummary;
  /** Recommended appraised / marketable / list prices (cents). */
  recommendation: PriceRecommendation;
  /** Optional market context (median, YoY, DOM). Skip references when null. */
  marketTrends: MarketTrends | null;
  /** "rapidapi" | "csv" | "both" — surfaced in the memo's data-quality note. */
  compsSource: "rapidapi" | "csv" | "both";
}

// ---------------------------------------------------------------------------
// Seller-facing narrative — conversational, presentation-ready.
// ---------------------------------------------------------------------------

export function getSellerNarrativePrompt(input: CmaPromptInput): {
  system: string;
  user: string;
} {
  const adjustmentRules = formatAdjustmentRules();
  return {
    system: `${COMPLIANCE_PREAMBLE}

You are a senior listing agent writing a CMA narrative the seller will read before the listing meeting. Your goal is to land the recommended list price as the obvious right choice — calmly, with specifics, no hype.

Structure (markdown):
1. **The Recommendation** — one-paragraph headline with the recommended list price and the two anchor values (appraised + marketable). State the recommended price up front.
2. **How We Got There** — 3–4 short paragraphs walking through the comps. Reference 3–5 specific comparable sales by their distinguishing facts (sqft, year built, bed/bath count, sold price, what made each more or less comparable). Use the per-feature adjustments to explain WHY a $X comp tells us the subject should be priced at $Y.
3. **Market Context** — one paragraph using the market-trend numbers if provided. Otherwise omit this section entirely (don't say "market data unavailable").
4. **Pricing Strategy** — one paragraph on the recommended price's positioning: aspirational vs. conservative, expected days on market, what happens if we test higher.

Voice: a calm, experienced advisor. The seller is sophisticated; the agent is the trusted expert. No exclamation points. Markdown only — no HTML, no images.

Per-feature adjustment rules used by the math (cite them in plain English where it helps):
${adjustmentRules}`,
    user: buildUserContext(input, "narrative"),
  };
}

// ---------------------------------------------------------------------------
// Internal memo — terse, for the agent's own use.
// ---------------------------------------------------------------------------

export function getInternalMemoPrompt(input: CmaPromptInput): {
  system: string;
  user: string;
} {
  return {
    system: `${COMPLIANCE_PREAMBLE}

You are writing a private pricing memo for the listing agent. The seller will NEVER see this document. Tone is candid, terse, defensive. Bullet-heavy.

Structure (markdown):
- **TL;DR** — one sentence with the recommended price and the strategy.
- **Pricing Math** — 3–6 bullets covering: where the grid landed (median + top-tertile), where the recommendation sits relative to both, $/sqft check vs. market, sanity-check on outlier comps.
- **Risks** — 3–5 bullets the agent must be ready to answer. Examples: stale comps, thin comp set, subject sqft outside ±20% of any usable comp, missing data fields, year-built skew.
- **Counter-positioning** — 1–2 bullets on what other agents may pitch the seller (often a higher number) and what to say.
- **Data Quality Note** — one short paragraph: number of comps, source (RapidAPI / CSV / both), date range of solds, anything missing.

Keep it under 350 words. No marketing tone. Plain markdown.`,
    user: buildUserContext(input, "memo"),
  };
}

// ---------------------------------------------------------------------------
// Shared context builder — same data both prompts need.
// ---------------------------------------------------------------------------

function buildUserContext(input: CmaPromptInput, mode: "narrative" | "memo"): string {
  const { subject, comps, grid, recommendation, marketTrends, address, compsSource } = input;
  const dollars = (cents: number) =>
    `$${Math.round(cents / 100).toLocaleString()}`;

  const subjectBlock = [
    `Address: ${address}`,
    `Beds/Baths: ${subject.beds ?? "?"} / ${subject.baths ?? "?"}`,
    `Living area: ${subject.living_area_sqft?.toLocaleString() ?? "?"} sqft`,
    `Lot: ${subject.lot_area_sqft?.toLocaleString() ?? "?"} sqft`,
    `Year built: ${subject.year_built ?? "?"}`,
    `Garage: ${subject.garage_spaces ?? "?"} spaces`,
    `Property type: ${subject.property_type ?? "?"}`,
    `ZIP: ${subject.zip ?? "?"}`,
  ].join("\n");

  const compsTable = comps
    .slice(0, 12) // cap context — top-of-grid comps drive the narrative
    .map((c, i) => {
      const adj = c.adjustments
        .map((a) => `${a.feature}: ${dollars(a.delta_cents)} (${a.reason})`)
        .join("; ");
      return [
        `Comp ${i + 1}: ${c.address ?? "(no address)"} — ${c.beds ?? "?"}bd/${c.baths ?? "?"}ba, ${c.living_area_sqft?.toLocaleString() ?? "?"} sqft, built ${c.year_built ?? "?"}`,
        `  sold ${c.sold_date ?? "?"} for ${dollars(c.sold_price_cents ?? 0)} (${c.distance_mi ?? "?"} mi)`,
        `  adjustments: ${adj || "none"}`,
        `  adjusted value: ${dollars(c.adjusted_value_cents)}`,
      ].join("\n");
    })
    .join("\n\n");

  const gridBlock = [
    `Comps in grid: ${grid.comp_count}`,
    `Median adjusted: ${dollars(grid.median_adjusted_value_cents)}`,
    `Mean adjusted: ${dollars(grid.mean_adjusted_value_cents)}`,
    `Top-tertile mean: ${dollars(grid.top_tertile_mean_cents)}`,
    `Radius: ${grid.criteria.radius_mi} mi · Months back: ${grid.criteria.months_back}`,
  ].join("\n");

  const recommendationBlock = [
    `Appraised (median): ${dollars(recommendation.appraised_value_cents)}`,
    `Marketable (top tertile): ${dollars(recommendation.marketable_value_cents)}`,
    `Recommended list: ${dollars(recommendation.recommended_price_cents)}`,
  ].join("\n");

  const marketBlock = marketTrends
    ? [
        `ZIP: ${marketTrends.zip}`,
        marketTrends.median_sold_price_cents
          ? `Median sold price: ${dollars(marketTrends.median_sold_price_cents)}`
          : null,
        marketTrends.median_sqft_price_cents
          ? `Median $/sqft: ${dollars(marketTrends.median_sqft_price_cents)}`
          : null,
        marketTrends.yoy_change_pct != null
          ? `YoY change: ${marketTrends.yoy_change_pct > 0 ? "+" : ""}${marketTrends.yoy_change_pct.toFixed(1)}%`
          : null,
        marketTrends.median_dom != null
          ? `Median days on market: ${marketTrends.median_dom}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  const sections = [
    `## Subject Property\n${subjectBlock}`,
    `## Adjustment Grid\n${gridBlock}`,
    `## Price Recommendation\n${recommendationBlock}`,
    marketBlock ? `## Market Trends\n${marketBlock}` : null,
    `## Comps (${comps.length} total, top ${Math.min(12, comps.length)} below)\n${compsTable}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const footer =
    mode === "memo"
      ? `\n\nData source: ${compsSource}. Write the internal pricing memo per the structure above.`
      : `\n\nWrite the seller-facing CMA narrative per the structure above. Cite specific comps by their facts.`;

  return sections + footer;
}

function formatAdjustmentRules(): string {
  return [
    `- Living area: comp's own $/sqft × (subject sqft − comp sqft)`,
    `- Beds: $${(BED_ADJUSTMENT_CENTS / 100).toLocaleString()} per bedroom delta`,
    `- Baths: $${(BATH_ADJUSTMENT_CENTS / 100).toLocaleString()} per bathroom delta (half-baths count)`,
    `- Garage: $${(GARAGE_ADJUSTMENT_CENTS / 100).toLocaleString()} per garage space delta`,
    `- Lot size: proportional to 15% of comp price, capped at ±10% of comp price`,
    `- Year built: 1% of comp price per decade newer/older, capped at ±10%`,
  ].join("\n");
}
