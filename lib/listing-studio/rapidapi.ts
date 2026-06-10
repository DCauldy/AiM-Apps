import "server-only";

// ============================================================
// RapidAPI — us-housing-market-data1 wrapper
//
// Single source of truth for outbound calls. Other code should NEVER
// hit RapidAPI directly — go through these helpers so we can:
//   - centralize auth header + base URL
//   - keep response shapes typed
//   - add caching / retries / rate-limit handling in one place
//
// Env: RAPIDAPI_KEY (the X-RapidAPI-Key header value)
//
// Failure modes (each caller handles):
//   - 401: key invalid / missing → throw RapidApiAuthError
//   - 429: rate-limited → throw RapidApiRateLimitError
//   - 5xx / network: throw RapidApiFetchError
//   - 200 + empty data: returns null / [] depending on shape (not an error)
// ============================================================

const RAPIDAPI_HOST = "us-housing-market-data1.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

export class RapidApiAuthError extends Error {
  constructor() {
    super("RapidAPI key invalid or missing (set RAPIDAPI_KEY).");
    this.name = "RapidApiAuthError";
  }
}

export class RapidApiRateLimitError extends Error {
  constructor(retryAfter?: string | null) {
    super(
      `RapidAPI rate-limited${retryAfter ? ` (retry after ${retryAfter})` : ""}.`,
    );
    this.name = "RapidApiRateLimitError";
  }
}

export class RapidApiFetchError extends Error {
  constructor(status: number, body: string) {
    super(`RapidAPI fetch failed (${status}): ${body.slice(0, 200)}`);
    this.name = "RapidApiFetchError";
  }
}

function requireKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new RapidApiAuthError();
  return key;
}

async function rapidFetch(path: string, params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(`${RAPIDAPI_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": requireKey(),
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
    // Per-request cache — Next caches by URL by default, but property
    // lookups need to be fresh per address (data is reasonably stable
    // day-to-day; per-listing app cache handles repeat calls).
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new RapidApiAuthError();
  }
  if (res.status === 429) {
    throw new RapidApiRateLimitError(res.headers.get("retry-after"));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RapidApiFetchError(res.status, body);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Public property facts (subject property lookup by address)
// ---------------------------------------------------------------------------

export interface PropertyFacts {
  /** Free-form address (echoed back from input + normalized by provider). */
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  /** Square footage of the dwelling. */
  living_area_sqft: number | null;
  lot_area_sqft: number | null;
  year_built: number | null;
  property_type: string | null;     // 'single_family' | 'condo' | 'multi' | etc.
  garage_spaces: number | null;
  /** Last known sale price (cents). NULL if no record. */
  last_sale_price_cents: number | null;
  last_sale_date: string | null;
  /** Provider's estimated value if returned. */
  estimated_value_cents: number | null;
  /** Whatever else the provider sends — keep so the form can hint at the source. */
  raw: unknown;
}

/**
 * Property lookup by address. NULL on no-match.
 *
 * The exact endpoint depends on which RapidAPI path the us-housing-market-data1
 * provider exposes; this wrapper normalizes whichever JSON they return into
 * PropertyFacts. If the provider's endpoint shape changes, only the normalizer
 * needs to update.
 */
export async function lookupProperty(address: string): Promise<PropertyFacts | null> {
  const raw = await rapidFetch("/property", { address });
  return normalizePropertyFacts(raw);
}

function normalizePropertyFacts(raw: unknown): PropertyFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Defensive coercion — provider field names may vary by tier or version.
  // Attempt the obvious aliases; fall back to null when missing.
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const parsed = Number.parseFloat(v.replace(/[,$]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const sale = num(r.last_sale_price ?? r.lastSalePrice ?? r.last_sold_price);
  const est = num(r.estimated_value ?? r.zestimate ?? r.avm);

  return {
    address: str(r.address ?? r.formatted_address),
    city: str(r.city),
    state: str(r.state ?? r.state_code),
    zip: str(r.zip ?? r.zip_code ?? r.postal_code),
    beds: num(r.beds ?? r.bedrooms),
    baths: num(r.baths ?? r.bathrooms),
    living_area_sqft: num(r.living_area ?? r.sqft ?? r.living_sqft),
    lot_area_sqft: num(r.lot_size ?? r.lot_sqft ?? r.lot_area),
    year_built: num(r.year_built ?? r.yearBuilt),
    property_type: str(r.property_type ?? r.propertyType),
    garage_spaces: num(r.garage ?? r.garage_spaces),
    last_sale_price_cents: sale !== null ? Math.round(sale * 100) : null,
    last_sale_date: str(r.last_sale_date ?? r.lastSaleDate ?? r.last_sold_date),
    estimated_value_cents: est !== null ? Math.round(est * 100) : null,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Sold comps (for CMA adjustment grid)
// ---------------------------------------------------------------------------

export interface CompsCriteria {
  /** Center point — typically the subject property's address or ZIP. */
  zip: string;
  /** Search radius in miles. */
  radius_mi?: number;
  /** Months back from today to look for sold dates. */
  months_back?: number;
  /** Optional filter — narrow to the subject's property type. */
  property_type?: string;
  /** Subject sqft for sqft-range filtering (within ±20%). */
  subject_sqft?: number;
  /** Hard cap on returned comp count. Provider may return fewer. */
  limit?: number;
}

export interface RawComp {
  address: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  living_area_sqft: number | null;
  lot_area_sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  /** Optional — provider may not return it consistently; CSV uploads can. */
  garage_spaces: number | null;
  sold_price_cents: number | null;
  sold_date: string | null;        // YYYY-MM-DD
  /** Distance in miles from the subject, if provider returns it. */
  distance_mi: number | null;
  raw: unknown;
}

/**
 * Fetch recently sold comparable properties around a ZIP.
 *
 * Returns [] on no-match; throws on auth / rate-limit / fetch errors.
 */
export async function fetchSoldComps(criteria: CompsCriteria): Promise<RawComp[]> {
  const params: Record<string, string | number> = {
    zip: criteria.zip,
    radius: criteria.radius_mi ?? 1,
    months: criteria.months_back ?? 6,
    limit: criteria.limit ?? 50,
  };
  if (criteria.property_type) params.property_type = criteria.property_type;

  const raw = await rapidFetch("/comps", params);
  return normalizeComps(raw);
}

function normalizeComps(raw: unknown): RawComp[] {
  if (!raw) return [];
  // Provider may return { results: [...] } or [...]
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>).results)
      ? ((raw as Record<string, unknown>).results as unknown[])
      : Array.isArray((raw as Record<string, unknown>).comps)
        ? ((raw as Record<string, unknown>).comps as unknown[])
        : [];

  const num = (v: unknown): number | null => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const parsed = Number.parseFloat(v.replace(/[,$]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  return arr.map((entry): RawComp => {
    const r = (entry ?? {}) as Record<string, unknown>;
    const price = num(r.sold_price ?? r.last_sale_price ?? r.price);
    return {
      address: str(r.address ?? r.formatted_address),
      zip: str(r.zip ?? r.postal_code),
      beds: num(r.beds ?? r.bedrooms),
      baths: num(r.baths ?? r.bathrooms),
      living_area_sqft: num(r.living_area ?? r.sqft ?? r.living_sqft),
      lot_area_sqft: num(r.lot_size ?? r.lot_sqft),
      year_built: num(r.year_built),
      property_type: str(r.property_type),
      garage_spaces: num(r.garage ?? r.garage_spaces),
      sold_price_cents: price !== null ? Math.round(price * 100) : null,
      sold_date: str(r.sold_date ?? r.last_sale_date),
      distance_mi: num(r.distance ?? r.distance_mi),
      raw: entry,
    };
  });
}

// ---------------------------------------------------------------------------
// Market trends (for CMA narrative + HTML email pricing context block)
// ---------------------------------------------------------------------------

export interface MarketTrends {
  zip: string;
  median_sold_price_cents: number | null;
  median_sqft_price_cents: number | null;
  /** Sold price YoY delta as a percentage (e.g. 4.2 = +4.2%). NULL if unknown. */
  yoy_change_pct: number | null;
  /** Median days on market for recent solds. */
  median_dom: number | null;
  /** Whatever else the provider returns. */
  raw: unknown;
}

export async function fetchMarketTrends(zip: string): Promise<MarketTrends | null> {
  const raw = await rapidFetch("/market", { zip });
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const parsed = Number.parseFloat(v.replace(/[,$%]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const med = num(r.median_sold_price ?? r.median_price);
  const psqft = num(r.median_price_per_sqft ?? r.median_sqft_price);
  return {
    zip,
    median_sold_price_cents: med !== null ? Math.round(med * 100) : null,
    median_sqft_price_cents: psqft !== null ? Math.round(psqft * 100) : null,
    yoy_change_pct: num(r.yoy_change ?? r.yoy_pct ?? r.year_over_year),
    median_dom: num(r.median_dom ?? r.median_days_on_market),
    raw,
  };
}
