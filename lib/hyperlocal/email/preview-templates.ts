import type { HlSegment, MlsMetrics, SegmentationType } from "@/types/hyperlocal";

// ============================================================
// Sample templates for the design-iteration preview tool.
//
// One template per SegmentationType so agents can preview what
// their email looks like at every scope they'd actually deploy
// — ZIP, city, county, subdivision, neighborhood, custom.
//
// The email renderer doesn't change shape across segmentation
// types (it just substitutes geo_label into the headline), but
// the *content* a real run produces does vary: bigger scopes
// have wider transaction volumes, smaller scopes have more
// intimate copy. These templates reflect that.
//
// Adding a new variant inside an existing segmentation type:
// either grow PREVIEW_TEMPLATES (the dropdown derives from it)
// or build a second axis later. For now: one per type, period.
// ============================================================

export interface PreviewTemplate {
  key: string;
  segmentation: SegmentationType;
  label: string;
  description: string;
  subject: string;
  preheader: string;
  segment: HlSegment;
  metrics: MlsMetrics;
  sellerHtml: string | null;
  buyerHtml: string | null;
  /** Representative ZIP for the Mapbox static-image lookup. ZIP-segmented
   *  templates use their own geo_key here; other segmentation types pick a
   *  ZIP that visually anchors the area. Without this we'd have to drop the
   *  map for non-ZIP previews (production has the same gap — separate epic). */
  preview_map_zip: string;
}

function makeSegment(opts: {
  label: string;
  type: SegmentationType;
  key?: string;
  contactCount: number;
}): HlSegment {
  return {
    id: `preview-${opts.label.toLowerCase().replace(/\s+/g, "-")}`,
    run_id: "preview-run",
    geo_key: opts.key ?? opts.label,
    geo_label: opts.label,
    geo_type: opts.type,
    contact_count: opts.contactCount,
    seller_contact_count: Math.round(opts.contactCount * 0.6),
    buyer_contact_count: Math.round(opts.contactCount * 0.4),
    mls_upload_id: null,
    mls_metrics: null,
    status: "ready",
    rolled_up_into: null,
    below_min_size: false,
    created_at: new Date().toISOString(),
  };
}

export const PREVIEW_TEMPLATES: PreviewTemplate[] = [
  // ---------------------------------------------------------------------------
  {
    key: "zip_37027",
    segmentation: "zip",
    label: "ZIP — 37027 (Brentwood)",
    description: "Tight 5-digit scope, ~155 contacts. Most common for dense suburbs.",
    preview_map_zip: "37027",
    subject: "37027 — 14 days on market, here's why",
    preheader: "Median sale $850K · 31 active listings · YoY up 4.1%",
    segment: makeSegment({ label: "37027", type: "zip", contactCount: 155 }),
    metrics: {
      median_sale_price: 850000,
      median_days_on_market: 14,
      list_to_sale_ratio: 101.6,
      inventory_active: 31,
      closed_last_30_days: 19,
      closed_last_90_days: 58,
      new_listings_last_30_days: 23,
      price_change_yoy: 4.1,
    },
    sellerHtml: `
<p>37027 stayed competitive this month. Median sale price held at <strong>$850K</strong> — up <strong>4.1%</strong> year over year — with <strong>31 active listings</strong> on the ground. Homes are moving in a median of <strong>14 days</strong>.</p>
<p>The 101.6% list-to-sale ratio means sellers are landing just above asking on most clean offers. If you've been thinking about a move, the supply-demand math in our ZIP is still working in your favor.</p>
<p>Happy to share what I'm seeing on the ground if it'd help.</p>
`.trim(),
    buyerHtml: `
<p>Inside 37027, competition is real but workable. <strong>19 homes closed</strong> in the last 30 days at a <strong>101.6%</strong> list-to-sale ratio — most winners came in modestly above asking, not in bidding-war territory.</p>
<p>For buyers who can move quickly with a clean offer, the 14-day median DOM is a workable target. Want me to set up alerts for new listings in this ZIP?</p>
`.trim(),
  },

  // ---------------------------------------------------------------------------
  {
    key: "city_franklin",
    segmentation: "city",
    label: "City — Franklin, TN",
    description: "Whole city, ~480 contacts. Useful for cross-neighborhood market updates.",
    preview_map_zip: "37064",
    subject: "Franklin market — Q1 by the numbers",
    preheader: "$720K median citywide · 480 active · 22 day DOM",
    segment: makeSegment({ label: "Franklin, TN", type: "city", contactCount: 480 }),
    metrics: {
      median_sale_price: 720000,
      median_days_on_market: 22,
      list_to_sale_ratio: 99.4,
      inventory_active: 142,
      closed_last_30_days: 87,
      closed_last_90_days: 261,
      new_listings_last_30_days: 96,
      price_change_yoy: 2.8,
    },
    sellerHtml: `
<p>Franklin's first quarter held its ground. Median sale price across the city sits at <strong>$720K</strong> — up a measured <strong>2.8%</strong> year over year — with <strong>142 active listings</strong> spread across our neighborhoods.</p>
<p>Citywide list-to-sale ratio came in at <strong>99.4%</strong>, telling you most well-priced homes are closing right at asking. Your specific pocket may be running hotter or cooler — happy to share a neighborhood-level breakdown if useful.</p>
`.trim(),
    buyerHtml: `
<p>Across Franklin, buyers have more to choose from than a year ago. <strong>96 new listings</strong> hit the market in the last 30 days, and the citywide list-to-sale ratio dropped to <strong>99.4%</strong> — small negotiations are back on the table.</p>
<p>The right neighborhood pocket still moves fast, but the overall city has loosened. Want me to narrow this down to your target areas?</p>
`.trim(),
  },

  // ---------------------------------------------------------------------------
  {
    key: "county_williamson",
    segmentation: "county",
    label: "County — Williamson County, TN",
    description: "County-wide aggregation, ~1,240 contacts. Best for broad trend updates.",
    preview_map_zip: "37064",
    subject: "Williamson County — what the data says",
    preheader: "$695K median · 28-day DOM · inventory climbing",
    segment: makeSegment({ label: "Williamson County", type: "county", contactCount: 1240 }),
    metrics: {
      median_sale_price: 695000,
      median_days_on_market: 28,
      list_to_sale_ratio: 98.7,
      inventory_active: 387,
      closed_last_30_days: 214,
      closed_last_90_days: 642,
      new_listings_last_30_days: 251,
      price_change_yoy: 1.4,
    },
    sellerHtml: `
<p>Williamson County's market continues to normalize. Median sale price across the county landed at <strong>$695K</strong> — up <strong>1.4%</strong> year over year — with inventory now at <strong>387 active listings</strong>, the most we've seen in 18 months.</p>
<p>The 28-day median DOM and <strong>98.7%</strong> list-to-sale ratio together signal a healthier balance than the frantic seller's market of 2024. Pricing your home accurately and presenting it well matter more than they did a year ago.</p>
`.trim(),
    buyerHtml: null,
  },

  // ---------------------------------------------------------------------------
  {
    key: "subdivision_westhaven",
    segmentation: "subdivision",
    label: "Subdivision — Westhaven",
    description: "Single subdivision, ~38 contacts. Intimate scope for established communities.",
    preview_map_zip: "37064",
    subject: "Westhaven — what neighbors sold for this month",
    preheader: "$1.2M median · 3 closings · 1 above-asking",
    segment: makeSegment({
      label: "Westhaven",
      type: "subdivision",
      contactCount: 38,
    }),
    metrics: {
      median_sale_price: 1_200_000,
      median_days_on_market: 18,
      list_to_sale_ratio: 100.8,
      inventory_active: 6,
      closed_last_30_days: 3,
      closed_last_90_days: 11,
      new_listings_last_30_days: 4,
      price_change_yoy: 5.2,
    },
    sellerHtml: `
<p>Westhaven had three closings in the last 30 days, with a median sale of <strong>$1.2M</strong> — up <strong>5.2%</strong> from the same period last year. One home closed slightly above asking; the list-to-sale ratio of <strong>100.8%</strong> reflects a market still in seller-friendly territory.</p>
<p>Inventory remains tight at <strong>6 active listings</strong>. If you've been considering a move, this is exactly the kind of window where a well-prepared listing can command premium attention.</p>
<p>I'd be happy to walk through your home's specific value in this market if you're curious.</p>
`.trim(),
    buyerHtml: null,
  },

  // ---------------------------------------------------------------------------
  {
    key: "neighborhood_brentwood",
    segmentation: "neighborhood",
    label: "Neighborhood — Brentwood",
    description: "Single neighborhood, ~247 contacts. Hyperlocal voice + neighbor-to-neighbor copy.",
    preview_map_zip: "37027",
    subject: "Brentwood — 12 days on market, here's why",
    preheader: "Median sale up $42K · inventory at 31 active",
    segment: makeSegment({
      label: "Brentwood",
      type: "neighborhood",
      contactCount: 247,
    }),
    metrics: {
      median_sale_price: 875000,
      median_days_on_market: 12,
      list_to_sale_ratio: 102.4,
      inventory_active: 31,
      closed_last_30_days: 18,
      closed_last_90_days: 54,
      new_listings_last_30_days: 22,
      price_change_yoy: 4.2,
    },
    sellerHtml: `
<p>Brentwood's median sale price hit <strong>$875K</strong> this month — up <strong>4.2%</strong> year over year and still climbing. Inventory remains tight at <strong>31 active listings</strong>, keeping pricing power firmly with sellers.</p>
<p>Homes are moving in a median of <strong>12 days</strong>, and the list-to-sale ratio sits at <strong>102.4%</strong> — meaning sellers are routinely getting above asking. If you've been on the fence about listing, the supply-demand math is on your side right now.</p>
<p>Happy to share what I'm seeing on the ground if it'd be useful.</p>
`.trim(),
    buyerHtml: `
<p>Competition is real in Brentwood right now — <strong>18 homes closed</strong> in the last 30 days at a <strong>102.4%</strong> list-to-sale ratio. Most winning offers are coming in above asking.</p>
<p>The silver lining: that 12-day average time-on-market drops sharply for well-priced homes near top schools. There's still opportunity for buyers who can move quickly and write a clean offer.</p>
<p>Want a heads-up when new listings hit your search criteria?</p>
`.trim(),
  },

  // ---------------------------------------------------------------------------
  {
    key: "custom_sphere_luxury",
    segmentation: "custom",
    label: "Custom — Sphere clients tagged 'Luxury Intent'",
    description: "Tag-driven audience, ~62 contacts. For curated lists outside geo boundaries.",
    preview_map_zip: "37027",
    subject: "Luxury market check-in — what's moving",
    preheader: "$2.4M+ closings · estate inventory steady · custom report",
    segment: makeSegment({
      label: "Luxury Intent",
      type: "custom",
      contactCount: 62,
    }),
    metrics: {
      median_sale_price: 2_350_000,
      median_days_on_market: 54,
      list_to_sale_ratio: 96.4,
      inventory_active: 22,
      closed_last_30_days: 5,
      closed_last_90_days: 14,
      new_listings_last_30_days: 7,
      price_change_yoy: 6.1,
    },
    sellerHtml: `
<p>The high-end segment we follow together had <strong>5 closings</strong> in the last 30 days — median sale price <strong>$2.35M</strong>, up <strong>6.1%</strong> year over year. Inventory sits at <strong>22 active listings</strong> across our watch list.</p>
<p>The 54-day median DOM and <strong>96.4%</strong> list-to-sale ratio reflect the longer decision cycles typical of this segment — strong fundamentals, just less velocity than the broader market.</p>
<p>If you'd like a private CMA or want to discuss positioning your home for this audience, I'm here.</p>
`.trim(),
    buyerHtml: `
<p>For the luxury search criteria we've been tracking, <strong>7 new listings</strong> came online in the last 30 days. Most are priced thoughtfully — the <strong>96.4%</strong> list-to-sale ratio means there's meaningful room for negotiation on the right property.</p>
<p>Happy to set up a private showing on any of the new arrivals that fit what you're looking for.</p>
`.trim(),
  },
];

export function getPreviewTemplate(key: string | null | undefined): PreviewTemplate {
  return (
    PREVIEW_TEMPLATES.find((t) => t.key === key) ?? PREVIEW_TEMPLATES[0]
  );
}
