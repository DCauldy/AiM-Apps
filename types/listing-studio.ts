// Listing Studio domain types — shared between API routes, server pages,
// and client components. Mirrors the ls_* DB schema in
// supabase/migrations/20260609000003_listing_studio_schema.sql.

export type ListingStage = "prospect" | "active" | "archived";

export type ListingOutputType =
  | "description"
  | "captions_doc"
  | "dotw_email"
  | "html_email";

export type ListingOutputStatus = "draft" | "finalized";

/**
 * Subject property facts. Normalized shape — what we store and what the
 * form binds against. Source of truth for prefill: lib/listing-studio/
 * rapidapi.ts → lookupProperty → normalizePropertyFacts.
 */
export interface PropertyFacts {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  beds?: number | null;
  baths?: number | null;
  living_area_sqft?: number | null;
  lot_area_sqft?: number | null;
  year_built?: number | null;
  property_type?: string | null;
  garage_spaces?: number | null;
  /** Last known sale (cents). Optional. */
  last_sale_price_cents?: number | null;
  last_sale_date?: string | null;
  /** Provider's automated valuation (cents). Optional. */
  estimated_value_cents?: number | null;
  /** Zillow Property ID — chained into RapidAPI comps + trend endpoints.
   *  Required for /propertyComps and /similarSales; populated by the
   *  property-lookup prefill. Falls back to a fresh lookup at CMA time
   *  if missing (legacy listings). */
  zpid?: string | null;
}

export interface ListingRow {
  id: string;
  user_id: string;
  profile_id: string | null;
  address: string;
  address_normalized: string | null;
  property_facts: PropertyFacts;
  prefilled_from_api: boolean;
  stage: ListingStage;
  promoted_at: string | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CmaRunRow {
  id: string;
  listing_id: string;
  comps_source: "rapidapi" | "csv" | "both" | null;
  comps: AdjustedComp[] | null;
  adjustment_grid: AdjustmentGridSummary | null;
  appraised_value_cents: number | null;
  marketable_value_cents: number | null;
  recommended_price_cents: number | null;
  seller_narrative_md: string | null;
  internal_memo_md: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

export interface AdjustedComp {
  address: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  living_area_sqft: number | null;
  lot_area_sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  sold_price_cents: number | null;
  sold_date: string | null;
  distance_mi: number | null;
  /** Per-feature adjustments applied to this comp, summing to total_adjustment_cents. */
  adjustments: Array<{
    feature: string;
    delta_cents: number;
    reason: string;
  }>;
  total_adjustment_cents: number;
  /** sold_price + total_adjustment, in cents. */
  adjusted_value_cents: number;
}

export interface AdjustmentGridSummary {
  comp_count: number;
  median_adjusted_value_cents: number;
  mean_adjusted_value_cents: number;
  /** Top tertile mean — drives marketable_value. */
  top_tertile_mean_cents: number;
  /** Filter criteria applied to the comp pool. */
  criteria: {
    radius_mi: number;
    months_back: number;
    property_type: string | null;
    sqft_range: { min: number; max: number } | null;
  };
}

export interface ListingOutputRow {
  id: string;
  listing_id: string;
  type: ListingOutputType;
  variant: string | null;
  content: string | null;
  status: ListingOutputStatus;
  compliance_warning: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

export interface ListingPhotoRow {
  id: string;
  listing_id: string;
  original_filename: string;
  suggested_order: number | null;
  caption: string | null;
  storage_path: string;
  expires_at: string;
  processed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface ListingsListResponse {
  listings: ListingRow[];
}

export interface ListingResponse {
  listing: ListingRow;
}

export interface PropertyLookupResponse {
  /** NULL when provider has no match — caller falls back to manual form. */
  facts:
    | (PropertyFacts & { address: string | null; zpid: string | null })
    | null;
  /** Surfaces "RapidAPI key invalid" / "rate limited" etc. to the UI. */
  error?: string;
}

export interface PromoteListingResponse {
  listing: ListingRow;
  /** Echoes the reserved meter state so the UI can update the header chip. */
  usage: {
    activeListingsPromoted: number;
    activeListingsLimit: number;
  };
}
