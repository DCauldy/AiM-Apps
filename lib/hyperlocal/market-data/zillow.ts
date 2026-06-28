import "server-only";

import type { MlsMetrics } from "@/types/hyperlocal";

// ============================================================
// Zillow market-data client (RapidAPI us-housing-market-data1).
//
// Auto-fetches the same per-ZIP market stats our emails need —
// median sale price, days on market, active inventory, recent closes
// — WITHOUT a manual MLS upload. Ported from the North-Reports
// fetch-neighborhood-data edge function: same provider, same
// /propertyExtendedSearch endpoint, the same compute-it-ourselves
// approach (the API returns raw listings; we do the stat math).
//
// Caller supplies a ZIP; we return an MlsMetrics object shaped exactly
// like the manual-upload path produces, so downstream generation is
// identical regardless of data source.
// ============================================================

const HOST =
  process.env.HYPERLOCAL_RAPIDAPI_HOST ?? "us-housing-market-data1.p.rapidapi.com";
const BASE = `https://${HOST}`;

/** Provider hard-limits ~2 req/sec; we space calls to stay safely under. */
const MIN_REQUEST_GAP_MS = 600;
let lastRequestAt = 0;

export interface MarketDataOptions {
  /** Restrict to property types (Zillow vocabulary). Defaults to homes. */
  homeTypes?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Max result pages to pull per status (20 is the provider cap). */
  maxPages?: number;
}

interface ZillowProp {
  price?: number;
  daysOnZillow?: number;
  dateSold?: number;
  livingArea?: number;
  listingStatus?: string;
  propertyType?: string;
}

interface ZillowSearchResponse {
  props?: ZillowProp[];
  totalResultCount?: number;
  totalPages?: number;
  currentPage?: number;
}

function apiKey(): string | null {
  return process.env.RAPIDAPI_KEY ?? null;
}

/** True when auto market-data can run (key configured). */
export function isMarketDataAvailable(): boolean {
  return !!apiKey();
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function search(
  params: Record<string, string>,
  attempt = 0,
): Promise<ZillowSearchResponse | null> {
  const key = apiKey();
  if (!key) return null;
  await rateLimit();

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/propertyExtendedSearch?${qs}`, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res) return null;
  // Back off once on rate-limit / transient 5xx.
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return search(params, attempt + 1);
  }
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as ZillowSearchResponse | null;
}

/** Pull every page (up to maxPages) of a search, flattening props. */
async function searchAll(
  params: Record<string, string>,
  maxPages: number,
): Promise<{ props: ZillowProp[]; totalResultCount: number }> {
  const first = await search({ ...params, page: "1" });
  if (!first) return { props: [], totalResultCount: 0 };
  const props = [...(first.props ?? [])];
  const totalResultCount = first.totalResultCount ?? props.length;
  const pages = Math.min(first.totalPages ?? 1, maxPages);
  for (let p = 2; p <= pages; p++) {
    const next = await search({ ...params, page: String(p) });
    if (next?.props) props.push(...next.props);
  }
  return { props, totalResultCount };
}

function median(nums: number[]): number | undefined {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (xs.length === 0) return undefined;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/**
 * Fetch + compute market metrics for one ZIP. Returns null only when no
 * provider key is configured; otherwise returns a (possibly sparse) metrics
 * object. Note: list_to_sale_ratio is intentionally absent — the provider's
 * sold payload carries the sale price but not the original list price, so we
 * can't compute it from this source (the manual MLS upload still can).
 */
export async function fetchMarketMetricsForZip(
  zip: string,
  options?: MarketDataOptions,
): Promise<MlsMetrics | null> {
  if (!apiKey()) return null;
  const homeTypes = options?.homeTypes ?? "Houses,Condos,Townhomes";
  const maxPages = options?.maxPages ?? 5;
  const priceParams: Record<string, string> = {};
  if (options?.minPrice) priceParams.minPrice = String(options.minPrice);
  if (options?.maxPrice) priceParams.maxPrice = String(options.maxPrice);

  // Two calls: recently-sold (last 90d) for price/DOM/closes, and active
  // for-sale for inventory + new listings.
  const [sold, active] = await Promise.all([
    searchAll(
      {
        location: zip,
        status_type: "RecentlySold",
        soldInLast: "90",
        home_type: homeTypes,
        ...priceParams,
      },
      maxPages,
    ),
    searchAll(
      {
        location: zip,
        status_type: "ForSale",
        home_type: homeTypes,
        ...priceParams,
      },
      maxPages,
    ),
  ]);

  const now = Date.now();
  const day = 86_400_000;
  const soldProps = sold.props;

  const metrics: MlsMetrics = {};

  const medPrice = median(soldProps.map((p) => p.price ?? 0));
  if (medPrice) metrics.median_sale_price = medPrice;

  const medDom = median(
    soldProps
      .map((p) => p.daysOnZillow ?? 0)
      .filter((d) => d > 0 && d < 5000),
  );
  if (medDom) metrics.median_days_on_market = medDom;

  // Active inventory: the provider's reported total for the for-sale search.
  if (active.totalResultCount > 0) metrics.inventory_active = active.totalResultCount;

  // Closed counts from sold dates (dateSold is epoch ms).
  const closed30 = soldProps.filter(
    (p) => p.dateSold && now - p.dateSold <= 30 * day,
  ).length;
  const closed90 = sold.totalResultCount || soldProps.length;
  if (closed30 > 0) metrics.closed_last_30_days = closed30;
  if (closed90 > 0) metrics.closed_last_90_days = closed90;

  // New listings (last 30 days) — a small extra for-sale call scoped to daysOn=30.
  const fresh = await searchAll(
    {
      location: zip,
      status_type: "ForSale",
      daysOn: "30",
      home_type: homeTypes,
      ...priceParams,
    },
    1,
  );
  if (fresh.totalResultCount > 0) {
    metrics.new_listings_last_30_days = fresh.totalResultCount;
  }

  return metrics;
}
