import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MlsMetrics } from "@/types/hyperlocal";
import {
  fetchMarketMetricsForZip,
  isMarketDataAvailable,
  type MarketDataOptions,
} from "./zillow";

export { isMarketDataAvailable };
export type { MarketDataOptions };

// ============================================================
// Cached per-ZIP market metrics. Auto-fetched market data is shared
// across users/campaigns for the same ZIP, so we cache each ZIP's
// metrics as a JSON blob in the hyperlocal-uploads bucket with a 24h
// TTL (matching North-Reports' neighborhood-data cache window). No
// migration — same storage-blob pattern as the sphere snapshot.
// ============================================================

const BUCKET = "hyperlocal-uploads";
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedMetrics {
  zip: string;
  metrics: MlsMetrics;
  computed_at: string;
}

/** Cache key folds price/type filters into the path so a filtered campaign
 *  doesn't read an all-types cache entry. */
function cachePath(zip: string, opts?: MarketDataOptions): string {
  const tag = [
    opts?.homeTypes ?? "all",
    opts?.minPrice ?? "",
    opts?.maxPrice ?? "",
  ]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return `market-data/${zip}/${tag || "default"}.json`;
}

async function readCache(
  zip: string,
  opts?: MarketDataOptions,
): Promise<MlsMetrics | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .download(cachePath(zip, opts));
  if (!data) return null;
  try {
    const cached = JSON.parse(await data.text()) as CachedMetrics;
    const age = Date.now() - new Date(cached.computed_at).getTime();
    if (Number.isNaN(age) || age > TTL_MS) return null;
    return cached.metrics;
  } catch {
    return null;
  }
}

async function writeCache(
  zip: string,
  metrics: MlsMetrics,
  opts?: MarketDataOptions,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const payload: CachedMetrics = {
    zip,
    metrics,
    computed_at: new Date().toISOString(),
  };
  await supabase.storage
    .from(BUCKET)
    .upload(cachePath(zip, opts), JSON.stringify(payload), {
      contentType: "application/json",
      upsert: true,
    });
}

/**
 * Get market metrics for a ZIP — cache-first, then live fetch. Returns null
 * when no provider key is configured OR the fetch yields nothing usable (so
 * the caller can fall back to manual MLS upload).
 */
export async function getMarketMetricsForZip(
  zip: string,
  opts?: MarketDataOptions,
): Promise<MlsMetrics | null> {
  if (!isMarketDataAvailable()) return null;

  const cached = await readCache(zip, opts);
  if (cached) return cached;

  const fresh = await fetchMarketMetricsForZip(zip, opts);
  // Only cache + return when we got at least a median price — a metrics object
  // with no price isn't worth a "full report" and should fall back to manual.
  if (!fresh || !fresh.median_sale_price) return null;

  await writeCache(zip, fresh, opts);
  return fresh;
}
