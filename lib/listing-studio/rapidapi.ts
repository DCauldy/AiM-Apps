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
  /** Provider's estimated value if returned (Zestimate). */
  estimated_value_cents: number | null;
  /** Zillow Property ID — chained into the comps and trend endpoints. */
  zpid: string | null;
  /** Geo coordinates — used by the Mapbox satellite fallback when the
   *  provider returns no usable image. */
  latitude: number | null;
  longitude: number | null;
  /** Whatever else the provider sends — keep so the form can hint at the source. */
  raw: unknown;
}

/**
 * Property lookup by address. NULL on no-match.
 *
 * Calls Zillow-style `/property` endpoint. The response includes a `zpid`
 * (Zillow Property ID) which downstream calls (comps, trends) chain off of.
 */
export async function lookupProperty(address: string): Promise<PropertyFacts | null> {
  const raw = await rapidFetch("/property", { address });
  return normalizePropertyFacts(raw);
}

function normalizePropertyFacts(raw: unknown): PropertyFacts | null {
  if (!raw || typeof raw !== "object") return null;
  // Provider returns the bare property object. `resoFacts` is a sibling
  // bag with the deeper MLS-derived fields (lot size as a string with
  // units, garage capacity, parking features, etc.) — pull from it when
  // top-level fields are missing.
  const r = raw as Record<string, unknown>;
  const reso = (r.resoFacts && typeof r.resoFacts === "object"
    ? (r.resoFacts as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  // Date handling — provider returns UNIX millisecond timestamps for
  // dateSold / dateSoldOnZillow, not strings. Normalize to YYYY-MM-DD.
  const isoFromMs = (ms: unknown): string | null => {
    const n =
      typeof ms === "number"
        ? ms
        : typeof ms === "string" && /^\d+$/.test(ms)
          ? Number(ms)
          : null;
    if (n === null || !Number.isFinite(n)) return null;
    return new Date(n).toISOString().split("T")[0];
  };

  const sale = numField(r.lastSoldPrice ?? r.last_sold_price);
  const est = numField(r.zestimate ?? r.estimated_value);

  // Property type — Zillow returns homeType like "SINGLE_FAMILY".
  // propertyTypeDimension ("Single Family") is human-friendly when present.
  const typeRaw =
    strField(r.propertyTypeDimension) ??
    strField(r.homeType) ??
    strField(r.property_type);
  const property_type = typeRaw ? typeRaw.toLowerCase().replace(/[\s-]+/g, "_") : null;

  // Lot size — `resoFacts.lotSize` is a string like "0.30 Acres" or
  // "13,068 sqft". Parse to a number of square feet.
  const lot_area_sqft =
    numField(r.lotAreaValue) ??
    numField(r.lotSize) ?? // fallback if top-level is a number
    parseLotSizeString(strField(reso.lotSize));

  // Garage spaces — Zillow uses several fields with inconsistent
  // population. Walk them in order of trustworthiness.
  const garage_spaces =
    numField(reso.garageParkingCapacity) ??
    numField(reso.coveredParkingCapacity) ??
    numField(r.garageSpaces) ??
    (reso.hasGarage === true ? 1 : null);

  return {
    address: strField(r.streetAddress),
    city: strField(r.city),
    state: strField(r.state),
    zip: strField(r.zipcode ?? r.zip ?? r.zip_code),
    beds: numField(r.bedrooms),
    baths: numField(r.bathrooms),
    living_area_sqft: numField(r.livingArea ?? r.livingAreaValue),
    lot_area_sqft,
    year_built: numField(r.yearBuilt),
    property_type,
    garage_spaces,
    last_sale_price_cents: sale !== null ? Math.round(sale * 100) : null,
    last_sale_date: isoFromMs(r.dateSold ?? r.dateSoldOnZillow),
    estimated_value_cents: est !== null ? Math.round(est * 100) : null,
    zpid: strField(r.zpid),
    latitude: numField(r.latitude),
    longitude: numField(r.longitude),
    raw,
  };
}

// Shared parser for numbers / strings, broken out so the comp normalizer
// can reuse without redeclaring closures in a hot loop.
function numField(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = Number.parseFloat(v.replace(/[,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function strField(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Parse Zillow's `resoFacts.lotSize` string into square feet.
 * Examples:
 *   "0.30 Acres"  → 13068
 *   "13,068 sqft" → 13068
 *   "0.5 ac"      → 21780
 */
function parseLotSizeString(s: string | null): number | null {
  if (!s) return null;
  const normalized = s.toLowerCase().replace(/,/g, "").trim();
  const m = normalized.match(/^([0-9.]+)\s*(acres?|ac|sqft|sq\.?\s*ft|square feet)?/);
  if (!m) return null;
  const val = Number.parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  const unit = m[2] ?? "";
  if (unit.startsWith("ac")) return Math.round(val * 43_560);
  return Math.round(val);
}

// ---------------------------------------------------------------------------
// Sold comps (for CMA adjustment grid)
// ---------------------------------------------------------------------------

export interface CompsCriteria {
  /** Zillow Property ID for the subject. Required — comps chain off zpid. */
  zpid: string;
  /** Optional fallback location for app-side filtering. */
  zip?: string;
  /** Search radius in miles (app-side filter after fetch). */
  radius_mi?: number;
  /** Months back from today to look for sold dates (app-side filter). */
  months_back?: number;
  /** Optional filter — narrow to the subject's property type. */
  property_type?: string;
  /** Subject sqft for sqft-range filtering (within ±20%). */
  subject_sqft?: number;
  /** Hard cap on returned comp count. Provider may return fewer. */
  limit?: number;
  /** Source toggle. `propertyComps` = provider's curated comps,
   *  `similarSales` = "recently sold homes with similar features".
   *  similarSales is closer to a true sold-only set; propertyComps may
   *  include actives. Default similarSales. */
  source?: "propertyComps" | "similarSales";
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
  /** Thumbnail URL — /similarSales returns this as miniCardPhotos[0].url
   *  so we avoid the per-comp /images round-trip. NULL when the comp
   *  source (CSV) doesn't include one. */
  image_url: string | null;
  /** Zillow Property ID — only present on API-sourced comps. Used to
   *  link out to a fuller record or fetch additional photos on demand. */
  zpid: string | null;
  raw: unknown;
}

/**
 * Fetch sold comparables for a subject property via its zpid.
 *
 * Two provider endpoints supported:
 *   - /similarSales — "recently sold homes with similar features" (default)
 *   - /propertyComps — provider's curated comp set (may include actives)
 *
 * The endpoint takes only `zpid`; radius/recency/sqft filters are applied
 * app-side in lib/listing-studio/cma/adjustment-grid.ts. Returns [] on
 * no-match; throws on auth / rate-limit / fetch errors.
 */
export async function fetchSoldComps(criteria: CompsCriteria): Promise<RawComp[]> {
  const endpoint =
    criteria.source === "propertyComps" ? "/propertyComps" : "/similarSales";
  const raw = await rapidFetch(endpoint, { zpid: criteria.zpid });
  return normalizeComps(raw);
}

function normalizeComps(raw: unknown): RawComp[] {
  if (!raw) return [];
  // /similarSales returns a bare array. /propertyComps may wrap.
  const obj = raw as Record<string, unknown>;
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(obj.comps)
      ? (obj.comps as unknown[])
      : Array.isArray(obj.properties)
        ? (obj.properties as unknown[])
        : Array.isArray(obj.results)
          ? (obj.results as unknown[])
          : Array.isArray(obj.similarSales)
            ? (obj.similarSales as unknown[])
            : [];

  const isoFromMs = (ms: unknown): string | null => {
    const n =
      typeof ms === "number"
        ? ms
        : typeof ms === "string" && /^\d+$/.test(ms)
          ? Number(ms)
          : null;
    if (n === null || !Number.isFinite(n)) return null;
    return new Date(n).toISOString().split("T")[0];
  };

  return arr.map((entry): RawComp => {
    const r = (entry ?? {}) as Record<string, unknown>;
    // `address` is a NESTED object on /similarSales — different from the
    // /property endpoint which mirrors fields to the top level.
    const addr = (r.address && typeof r.address === "object"
      ? (r.address as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const price = numField(
      r.lastSoldPrice ?? r.last_sold_price ?? r.closePrice ?? r.price,
    );
    const homeType =
      strField(r.homeType ?? r.property_type ?? r.propertyType) ?? null;

    // miniCardPhotos: [{ url }, …] — first entry is the canonical thumbnail.
    let image_url: string | null = null;
    const mini = r.miniCardPhotos;
    if (Array.isArray(mini) && mini.length > 0) {
      const first = mini[0] as Record<string, unknown> | undefined;
      image_url = strField(first?.url);
    }
    if (!image_url) {
      image_url = strField(r.imgSrc ?? r.image_url);
    }

    return {
      address: strField(addr.streetAddress ?? r.streetAddress ?? r.address),
      zip: strField(addr.zipcode ?? addr.zip ?? r.zipcode),
      beds: numField(r.bedrooms ?? r.beds),
      baths: numField(r.bathrooms ?? r.baths),
      living_area_sqft: numField(r.livingArea ?? r.livingAreaValue),
      // /similarSales doesn't include lot or year — fields stay null and
      // the adjustment grid skips per-feature deltas it can't compute.
      lot_area_sqft: numField(r.lotSize ?? r.lot_size ?? r.lot_sqft),
      year_built: numField(r.yearBuilt ?? r.year_built),
      property_type: homeType ? homeType.toLowerCase().replace(/[\s-]+/g, "_") : null,
      garage_spaces: numField(r.garageSpaces ?? r.garage ?? r.garage_spaces),
      sold_price_cents: price !== null ? Math.round(price * 100) : null,
      sold_date: isoFromMs(r.dateSold) ?? strField(r.sold_date ?? r.last_sale_date),
      distance_mi: numField(r.distance ?? r.distance_mi),
      image_url,
      zpid: strField(r.zpid),
      raw: entry,
    };
  });
}

// ---------------------------------------------------------------------------
// Property images (used for the subject hero in the CMA tab)
// ---------------------------------------------------------------------------

/**
 * Fetch all image URLs for a property. For off-market homes the provider
 * typically returns a single Google Street View URL; for on-market or
 * recently-sold homes it returns 20+ MLS-derived photo URLs.
 *
 * Returns [] on no-match or on any error — image is decorative, never
 * critical. Caller should not throw on null.
 */
export async function fetchPropertyImages(zpid: string): Promise<string[]> {
  try {
    const raw = await rapidFetch("/images", { zpid });
    if (!raw) return [];
    const obj = raw as Record<string, unknown>;
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(obj.images)
        ? (obj.images as unknown[])
        : Array.isArray(obj.photos)
          ? (obj.photos as unknown[])
          : [];
    return arr
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const r = entry as Record<string, unknown>;
          return strField(r.url ?? r.src ?? r.href);
        }
        return null;
      })
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
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

/**
 * Market trends — pulls from /valueHistory/zestimatePercentChange (the
 * cleanest YoY signal the provider exposes for a ZIP / property) and
 * /valueHistory/listingPrices (median listing price). Falls back to NULL
 * fields when individual endpoints return empty so the CMA narrative can
 * gracefully omit any metric we don't have.
 *
 * Accepts either a zpid (preferred — provider's local-area aggregation
 * is more accurate for a known property) or a bare zip code.
 */
export async function fetchMarketTrends(
  input: { zpid?: string; zip: string },
): Promise<MarketTrends | null> {
  const params: Record<string, string | number> = {};
  if (input.zpid) params.zpid = input.zpid;
  else params.location = input.zip;

  // Both calls are independent — fire in parallel. Either may fail; we
  // tolerate partial data and let the caller decide what to show.
  const [yoyRes, listingsRes] = await Promise.allSettled([
    rapidFetch("/valueHistory/zestimatePercentChange", params),
    rapidFetch("/valueHistory/listingPrices", params),
  ]);

  const yoyRaw =
    yoyRes.status === "fulfilled" ? (yoyRes.value as Record<string, unknown>) : {};
  const listingsRaw =
    listingsRes.status === "fulfilled"
      ? (listingsRes.value as Record<string, unknown>)
      : {};

  // Both endpoints return { chartData: [{ points: [{x: ms, y: value}], name: ... }] }.
  // Pull the latest y from each series. zestimatePercentChange's y is the
  // %-change number; listingPrices's y is the median listing price.
  const latestY = (raw: Record<string, unknown>): number | null => {
    const chart = raw.chartData;
    if (!Array.isArray(chart) || chart.length === 0) return null;
    // If there are multiple series (e.g. "Sale" + "List"), prefer "Sale".
    const pick =
      (chart as Array<Record<string, unknown>>).find(
        (s) => typeof s?.name === "string" && /sale/i.test(s.name as string),
      ) ?? chart[0];
    const points = (pick as Record<string, unknown>).points;
    if (!Array.isArray(points) || points.length === 0) return null;
    const newest = points[points.length - 1] as Record<string, unknown>;
    return numField(newest?.y);
  };

  const yoy = latestY(yoyRaw);
  const med = latestY(listingsRaw);

  if (yoy === null && med === null) return null;

  return {
    zip: input.zip,
    median_sold_price_cents: med !== null ? Math.round(med * 100) : null,
    median_sqft_price_cents: null, // not exposed by these endpoints
    yoy_change_pct: yoy,
    median_dom: null, // not exposed by these endpoints
    raw: { zestimatePercentChange: yoyRaw, listingPrices: listingsRaw },
  };
}
