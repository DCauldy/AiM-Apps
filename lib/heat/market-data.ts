import "server-only";

import type { HeatListing } from "./types";

// ============================================================
// Heat — market-data client (RapidAPI us-housing-market-data1).
//
// Same provider + key as lib/hyperlocal/market-data/zillow.ts, but Heat
// needs the DEMAND signals that only the /property detail payload carries:
// pageViewCount (views) and favoriteCount (saves). Flow:
//   1. /propertyExtendedSearch  → candidate for-sale listings (1 call)
//   2. /property?zpid=…         → views/saves/priceHistory (1 call each)
//   3. /images?zpid=…           → hi-res gallery (1 call each, on demand)
//
// Verified REST contract (2026-07-01): zpid works directly on /property
// and /images (the MCP wrapper's "Zpid is not valid" was a wrapper bug).
// Provider hard-limits ~2 req/sec, so every call is spaced ≥600ms.
//
// TODO(shared): the rate-limited fetch core is duplicated from zillow.ts;
// extract into lib/housing/rapidapi-client.ts once both apps are stable.
// ============================================================

const HOST =
  process.env.HYPERLOCAL_RAPIDAPI_HOST ?? "us-housing-market-data1.p.rapidapi.com";
const BASE = `https://${HOST}`;

const MIN_REQUEST_GAP_MS = 600;
let lastRequestAt = 0;

function apiKey(): string | null {
  return process.env.RAPIDAPI_KEY ?? null;
}

/** True when the provider key is configured. */
export function isHeatDataAvailable(): boolean {
  return !!apiKey();
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** Rate-limited GET with one backoff on 429/5xx. Returns parsed JSON or null. */
async function get<T>(
  path: string,
  params: Record<string, string>,
  attempt = 0,
): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;
  await rateLimit();

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res) return null;
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return get<T>(path, params, attempt + 1);
  }
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

// ---- response shapes (only the fields we consume) ------------------------

export interface SearchProp {
  zpid: string;
  address?: string;
  price?: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  livingArea?: number | null;
  daysOnZillow?: number;
  dateSold?: number | null;
  propertyType?: string;
  imgSrc?: string | null;
  detailUrl?: string | null;
}

interface SearchResponse {
  props?: SearchProp[];
  totalResultCount?: number;
  totalPages?: number;
}

interface PriceHistoryEvent {
  date?: string;
  event?: string;
  price?: number | null;
  priceChangeRate?: number | null;
  time?: number | null;
}

export interface ListingDetail {
  zpid: number | string;
  pageViewCount?: number;
  favoriteCount?: number;
  priceHistory?: PriceHistoryEvent[];
  price?: number;
  daysOnZillow?: number;
}

interface ImagesResponse {
  images?: string[];
}

export interface SearchListingsParams {
  location: string; // ZIP
  minPrice?: number | null;
  maxPrice?: number | null;
  homeTypes?: string; // Zillow vocabulary; defaults to homes
  maxPages?: number;
}

// ---- public API ----------------------------------------------------------

/** Page through for-sale results for one ZIP, flattening props. */
export async function searchListings(
  params: SearchListingsParams,
): Promise<SearchProp[]> {
  const base: Record<string, string> = {
    location: params.location,
    status_type: "ForSale",
    home_type: params.homeTypes ?? "Houses,Condos,Townhomes",
  };
  if (params.minPrice) base.minPrice = String(params.minPrice);
  if (params.maxPrice) base.maxPrice = String(params.maxPrice);

  const maxPages = params.maxPages ?? 5;
  const first = await get<SearchResponse>("/propertyExtendedSearch", {
    ...base,
    page: "1",
  });
  if (!first?.props) return [];
  const props = [...first.props];
  const pages = Math.min(first.totalPages ?? 1, maxPages);
  for (let p = 2; p <= pages; p++) {
    const next = await get<SearchResponse>("/propertyExtendedSearch", {
      ...base,
      page: String(p),
    });
    if (next?.props) props.push(...next.props);
  }
  return props;
}

/** Page through recently-sold results (last `soldInLast` days) for one ZIP. */
export async function searchSold(
  params: SearchListingsParams & { soldInLast?: string },
): Promise<SearchProp[]> {
  const base: Record<string, string> = {
    location: params.location,
    status_type: "RecentlySold",
    soldInLast: params.soldInLast ?? "90",
    home_type: params.homeTypes ?? "Houses,Condos,Townhomes",
  };
  if (params.minPrice) base.minPrice = String(params.minPrice);
  if (params.maxPrice) base.maxPrice = String(params.maxPrice);

  const maxPages = params.maxPages ?? 3;
  const first = await get<SearchResponse>("/propertyExtendedSearch", {
    ...base,
    page: "1",
  });
  if (!first?.props) return [];
  const props = [...first.props];
  const pages = Math.min(first.totalPages ?? 1, maxPages);
  for (let p = 2; p <= pages; p++) {
    const next = await get<SearchResponse>("/propertyExtendedSearch", {
      ...base,
      page: String(p),
    });
    if (next?.props) props.push(...next.props);
  }
  return props;
}

/** Fetch the detail payload (views/saves/priceHistory) for one listing. */
export function fetchListingDetail(zpid: string): Promise<ListingDetail | null> {
  return get<ListingDetail>("/property", { zpid });
}

export interface SoldMetrics {
  soldPrice: number | null;
  listPrice: number | null;
  /** sold ÷ original list price for the winning listing cycle (e.g. 0.98). */
  listToSp: number | null;
  /** Downward price changes during that listing cycle. */
  cutCount: number;
}

/**
 * Derive list-to-sale ratio + cut count from a sold home's price history.
 * priceHistory is newest-first: [..Sold, ..Price change, Listed for sale, ..older].
 * We isolate the most-recent list→sold cycle and compare its list vs sale price.
 */
export function soldMetricsFromDetail(detail: ListingDetail | null): SoldMetrics {
  const ph = detail?.priceHistory ?? [];
  const soldIdx = ph.findIndex((e) => e.event === "Sold" && (e.price ?? 0) > 0);
  if (soldIdx === -1) return { soldPrice: null, listPrice: null, listToSp: null, cutCount: 0 };

  const listIdx = ph.findIndex(
    (e, i) => i >= soldIdx && e.event === "Listed for sale" && (e.price ?? 0) > 0,
  );
  const soldPrice = ph[soldIdx].price ?? null;
  const listPrice = listIdx !== -1 ? (ph[listIdx].price ?? null) : null;

  const cycle = listIdx !== -1 ? ph.slice(soldIdx, listIdx + 1) : [];
  const cutCount = cycle.filter(
    (e) => e.event === "Price change" && typeof e.priceChangeRate === "number" && e.priceChangeRate < 0,
  ).length;

  return {
    soldPrice,
    listPrice,
    listToSp: soldPrice && listPrice ? soldPrice / listPrice : null,
    cutCount,
  };
}

/** Fetch the hi-res image gallery for one listing. */
export async function fetchListingImages(zpid: string): Promise<string[]> {
  const res = await get<ImagesResponse>("/images", { zpid });
  return res?.images ?? [];
}

// ---- rich detail for the listing modal -----------------------------------

interface RawProperty {
  zpid?: number | string;
  description?: string | null;
  homeType?: string | null;
  yearBuilt?: number | null;
  zestimate?: number | null;
  rentZestimate?: number | null;
  monthlyHoaFee?: number | null;
  address?: { streetAddress?: string; city?: string; state?: string; zipcode?: string };
  attributionInfo?: {
    agentName?: string | null;
    agentPhoneNumber?: string | null;
    brokerName?: string | null;
  };
  resoFacts?: {
    lotSize?: string | null;
    heating?: string[] | null;
    cooling?: string[] | null;
    parkingFeatures?: string[] | null;
    hoaFee?: string | null;
    taxAssessedValue?: number | null;
    appliances?: string[] | null;
  };
  schools?: {
    name?: string;
    rating?: number | null;
    level?: string | null;
    distance?: number | null;
  }[];
  priceHistory?: {
    date?: string;
    price?: number | null;
    event?: string | null;
    pricePerSquareFoot?: number | null;
  }[];
}

export interface RichListing {
  zpid: string;
  description: string | null;
  homeType: string | null;
  yearBuilt: number | null;
  lotSize: string | null;
  hoa: string | null;
  heating: string | null;
  cooling: string | null;
  parking: string | null;
  appliances: string[];
  zestimate: number | null;
  rentZestimate: number | null;
  taxAssessedValue: number | null;
  agent: { name: string | null; phone: string | null; broker: string | null };
  schools: { name: string; rating: number | null; level: string; distance: number | null }[];
  priceHistory: { date: string; price: number | null; event: string; ppsf: number | null }[];
}

/** Fetch + normalize the detail payload for the listing modal. */
export async function fetchListingRich(zpid: string): Promise<RichListing | null> {
  const p = await get<RawProperty>("/property", { zpid });
  if (!p) return null;
  const f = p.resoFacts ?? {};
  return {
    zpid: String(p.zpid ?? zpid),
    description: p.description ?? null,
    homeType: p.homeType ?? null,
    yearBuilt: p.yearBuilt ?? null,
    lotSize: f.lotSize ?? null,
    hoa: f.hoaFee ?? (p.monthlyHoaFee ? `$${p.monthlyHoaFee}/mo` : null),
    heating: f.heating?.join(", ") ?? null,
    cooling: f.cooling?.join(", ") ?? null,
    parking: f.parkingFeatures?.join(", ") ?? null,
    appliances: f.appliances ?? [],
    zestimate: p.zestimate ?? null,
    rentZestimate: p.rentZestimate ?? null,
    taxAssessedValue: f.taxAssessedValue ?? null,
    agent: {
      name: p.attributionInfo?.agentName ?? null,
      phone: p.attributionInfo?.agentPhoneNumber ?? null,
      broker: p.attributionInfo?.brokerName ?? null,
    },
    schools: (p.schools ?? [])
      .filter((s) => s.name)
      .map((s) => ({
        name: s.name as string,
        rating: s.rating ?? null,
        level: s.level ?? "",
        distance: s.distance ?? null,
      })),
    priceHistory: (p.priceHistory ?? [])
      .filter((e) => e.date)
      .map((e) => ({
        date: e.date as string,
        price: e.price ?? null,
        event: e.event ?? "",
        ppsf: e.pricePerSquareFoot ?? null,
      })),
  };
}

/** Count downward price changes in a listing's history. */
export function priceCutCount(detail: ListingDetail | null): number {
  if (!detail?.priceHistory) return 0;
  return detail.priceHistory.filter(
    (e) =>
      e.event === "Price change" &&
      typeof e.priceChangeRate === "number" &&
      e.priceChangeRate < 0,
  ).length;
}

/** Merge a search prop + its detail payload into the scorer's HeatListing shape. */
export function toHeatListing(
  prop: SearchProp,
  detail: ListingDetail | null,
): HeatListing {
  return {
    zpid: prop.zpid,
    address: prop.address ?? "",
    price: prop.price ?? 0,
    beds: prop.bedrooms ?? null,
    baths: prop.bathrooms ?? null,
    livingArea: prop.livingArea ?? null,
    daysOnMarket: prop.daysOnZillow ?? 0,
    views: detail?.pageViewCount ?? 0,
    saves: detail?.favoriteCount ?? 0,
    priceCutCount: priceCutCount(detail),
    propertyType: prop.propertyType,
    imgSrc: prop.imgSrc ?? null,
    detailUrl: prop.detailUrl ?? null,
  };
}
