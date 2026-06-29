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

You are a senior listing agent writing a CMA section the seller will read before the listing meeting. Your goal: land the recommended list price as the obvious choice. CALM, SPECIFIC, NEVER VERBOSE.

OUTPUT FORMAT — strict markdown, no exceptions:
## The Recommendation
List $RECOMMENDED. Estimated value $ESTIMATED; marketable $MARKETABLE. (1 sentence + numbers. No preamble.)

## How We Got There
- Comp 1 (address, beds/baths/sqft) — sold for $X; adjusted $Y (1-line reason)
- Comp 2 — sold for $X; adjusted $Y (1-line reason)
- Comp 3 — sold for $X; adjusted $Y (1-line reason)
(Bullets only, max 5 comps cited. Each bullet ≤ 20 words.)

## Pricing Strategy
(1-2 sentences. Position the price as aspirational/conservative; expected DOM; what testing $5-10K higher would mean.)

HARD RULES:
- DO NOT write paragraphs of prose. Bullets and short sentences only.
- DO NOT use opening filler ("Based on comparable sales analysis, I recommend...")
- DO NOT wrap section titles in **bold** — the renderer formats them.
- LEAD with numbers. Numbers first, justification second.
- NO exclamation points. NO marketing tone.
- If the grid had <3 comps, prepend a short note in The Recommendation: "Low confidence: only N comps survived filtering."
- Skip Market Context if no trend data is provided.

Per-feature adjustment rules (cite when helpful):
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

Private pricing memo for the listing agent. Seller will NEVER see this. Candid, terse, defensive. Bullet-heavy.

OUTPUT FORMAT — strict markdown:
### TL;DR
One sentence: recommended price + strategy.

### Pricing Math
- where the grid landed (median + top-tertile)
- where the recommendation sits relative to both (% above/below)
- $/sqft sanity check vs comp range
- one note on any outlier comps
(Max 5 bullets, each ≤ 20 words.)

### Risks
- thin comp set / stale comps / sqft outside ±20% / missing fields / year-built skew
(2-5 bullets, each ≤ 20 words.)

### Counter-positioning
- what other agents may pitch (usually higher) and what to say
(1-2 bullets.)

### Data Quality
- N comps from {source} · date range · any missing fields
(1 line, terse.)

HARD RULES:
- DO NOT use **bold** around section headings — renderer does it.
- BULLETS ONLY. No paragraphs. Each bullet ≤ 20 words.
- Total under 200 words.`,
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
