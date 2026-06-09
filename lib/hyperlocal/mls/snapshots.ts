import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { detectMlsColumns } from "./parser";

// ============================================================
// Monthly market snapshots.
//
// Companion to computeMetrics() in metrics.ts. That helper produces a
// single aggregate over a slice of MLS rows (used to render the current
// email's metric block). This helper produces ONE aggregate per
// (year, month) bucket present in the data — used to populate the
// permanent hl_market_snapshots table.
//
// Bucketing key: closed_date month. New-listing counts roll into the
// list_date month. Rows without a closed_date AND no list_date are
// skipped — they don't anchor to a period.
//
// Output is intended to be upserted via ON CONFLICT to the unique
// (profile_id, geo_key, period_year, period_month) constraint, so
// re-uploading the same month overwrites the prior snapshot.
// ============================================================

export interface MonthlySnapshot {
  geo_key: string;
  geo_label: string | null;
  geo_type: string | null;
  period_year: number;
  period_month: number;
  median_sale_price: number | null;
  median_days_on_market: number | null;
  list_to_sale_ratio: number | null;
  closed_count: number;
  active_inventory: number | null;
  new_listing_count: number;
}

/**
 * Compute one snapshot row per (year, month) present in the data for a
 * single geo. The `geo_*` fields are passed in by the caller because the
 * row data itself doesn't always know which segment it came from — the
 * caller has already filtered to the relevant rows for this geo.
 */
export function computeMonthlySnapshots(
  rows: Record<string, unknown>[],
  columns: string[],
  geo: { key: string; label: string | null; type: string | null },
  columnMap?: ReturnType<typeof detectMlsColumns>,
): MonthlySnapshot[] {
  if (rows.length === 0) return [];
  const map = columnMap ?? detectMlsColumns(columns);

  // Bucket: { "2026-3": { closed: [...], listed: [...], active: count } }
  type Bucket = {
    closed: Record<string, unknown>[];
    listed: Record<string, unknown>[];
  };
  const buckets = new Map<string, Bucket>();
  const getBucket = (year: number, month: number) => {
    const k = `${year}-${month}`;
    let b = buckets.get(k);
    if (!b) {
      b = { closed: [], listed: [] };
      buckets.set(k, b);
    }
    return b;
  };

  // active_inventory is a snapshot, not a per-month measure — apply only to
  // the "current" month (latest list_date or closed_date in the data).
  let latestYear = -Infinity;
  let latestMonth = -Infinity;
  let activeCount = 0;

  const track = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (y > latestYear || (y === latestYear && m > latestMonth)) {
      latestYear = y;
      latestMonth = m;
    }
  };

  for (const row of rows) {
    const status = readString(row, map.status)?.toLowerCase() ?? "";
    const closedDate = readDate(row, map.closed_date);
    const listDate = readDate(row, map.list_date);

    if (status.includes("active")) activeCount++;

    if (closedDate) {
      const d = new Date(closedDate);
      getBucket(d.getFullYear(), d.getMonth() + 1).closed.push(row);
      track(d);
    }
    if (listDate) {
      const d = new Date(listDate);
      getBucket(d.getFullYear(), d.getMonth() + 1).listed.push(row);
      track(d);
    }
  }

  const snapshots: MonthlySnapshot[] = [];
  for (const [key, bucket] of buckets) {
    const [year, month] = key.split("-").map(Number);
    const closedAgg = aggregateClosed(bucket.closed, map);
    const isLatestBucket = year === latestYear && month === latestMonth;
    snapshots.push({
      geo_key: geo.key,
      geo_label: geo.label,
      geo_type: geo.type,
      period_year: year,
      period_month: month,
      median_sale_price: closedAgg.median_sale_price,
      median_days_on_market: closedAgg.median_days_on_market,
      list_to_sale_ratio: closedAgg.list_to_sale_ratio,
      closed_count: bucket.closed.length,
      new_listing_count: bucket.listed.length,
      active_inventory: isLatestBucket && activeCount > 0 ? activeCount : null,
    });
  }
  return snapshots;
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

/**
 * Read trend data for one geo on one profile. Returns:
 *   - YoY: current vs same month a year ago
 *   - 3-year: current vs 36 months ago
 *   - 12 months of history (for sparkline / writer prompt context)
 *
 * "Current" is the most recent snapshot for the geo, not real-world today —
 * agents may upload last month's MLS data, not today's. We compare against
 * what's actually in the table.
 */
export interface GeoTrends {
  current_period: { year: number; month: number } | null;
  current_median_sale_price: number | null;
  yoy_price_change_pct: number | null;
  three_year_price_change_pct: number | null;
  twelve_month_history: Array<{
    year: number;
    month: number;
    median_sale_price: number | null;
    closed_count: number;
  }>;
}

export async function getTrendsForGeo(
  supabase: SupabaseClient,
  profileId: string,
  geoKey: string,
): Promise<GeoTrends> {
  // Pull the last 37 months — enough for current + YoY + 3-year comparison
  // + 12-month history. ~37 rows max, tiny payload.
  const { data } = await supabase
    .from("hl_market_snapshots")
    .select("period_year, period_month, median_sale_price, closed_count")
    .eq("profile_id", profileId)
    .eq("geo_key", geoKey)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(37);

  const rows = (data ?? []) as Array<{
    period_year: number;
    period_month: number;
    median_sale_price: number | null;
    closed_count: number;
  }>;

  if (rows.length === 0) {
    return {
      current_period: null,
      current_median_sale_price: null,
      yoy_price_change_pct: null,
      three_year_price_change_pct: null,
      twelve_month_history: [],
    };
  }

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byKey.set(`${r.period_year}-${r.period_month}`, r);

  const current = rows[0];
  const currentKey = { year: current.period_year, month: current.period_month };

  const yoy = byKey.get(`${currentKey.year - 1}-${currentKey.month}`) ?? null;
  const threeYear = byKey.get(`${currentKey.year - 3}-${currentKey.month}`) ?? null;

  const pctChange = (older: number | null, newer: number | null): number | null => {
    if (!older || !newer || older === 0) return null;
    return Number((((newer - older) / older) * 100).toFixed(1));
  };

  // 12 months of history, oldest → newest, padded with zeros for gaps.
  const history: GeoTrends["twelve_month_history"] = [];
  for (let i = 11; i >= 0; i--) {
    let y = currentKey.year;
    let m = currentKey.month - i;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const r = byKey.get(`${y}-${m}`);
    history.push({
      year: y,
      month: m,
      median_sale_price: r?.median_sale_price ?? null,
      closed_count: r?.closed_count ?? 0,
    });
  }

  return {
    current_period: currentKey,
    current_median_sale_price: current.median_sale_price,
    yoy_price_change_pct: pctChange(
      yoy?.median_sale_price ?? null,
      current.median_sale_price,
    ),
    three_year_price_change_pct: pctChange(
      threeYear?.median_sale_price ?? null,
      current.median_sale_price,
    ),
    twelve_month_history: history,
  };
}

/**
 * Upsert a batch of snapshots for a single profile. Uses the unique
 * constraint on (profile_id, geo_key, period_year, period_month) so
 * re-uploads overwrite cleanly. Caller is service-role.
 */
export async function upsertSnapshots(
  supabase: SupabaseClient,
  profileId: string,
  sourceUploadId: string | null,
  snapshots: MonthlySnapshot[],
): Promise<void> {
  if (snapshots.length === 0) return;
  const rows = snapshots.map((s) => ({
    profile_id: profileId,
    geo_key: s.geo_key,
    geo_label: s.geo_label,
    geo_type: s.geo_type,
    period_year: s.period_year,
    period_month: s.period_month,
    median_sale_price: s.median_sale_price,
    median_days_on_market: s.median_days_on_market,
    list_to_sale_ratio: s.list_to_sale_ratio,
    closed_count: s.closed_count,
    active_inventory: s.active_inventory,
    new_listing_count: s.new_listing_count,
    source_upload_id: sourceUploadId,
    computed_at: new Date().toISOString(),
  }));
  await supabase
    .from("hl_market_snapshots")
    .upsert(rows, {
      onConflict: "profile_id,geo_key,period_year,period_month",
    });
}

// ---------------------------------------------------------------------------
// Internal — closed-row aggregation (same math as computeMetrics for parity)
// ---------------------------------------------------------------------------

function aggregateClosed(
  rows: Record<string, unknown>[],
  map: ReturnType<typeof detectMlsColumns>,
): {
  median_sale_price: number | null;
  median_days_on_market: number | null;
  list_to_sale_ratio: number | null;
} {
  if (rows.length === 0) {
    return {
      median_sale_price: null,
      median_days_on_market: null,
      list_to_sale_ratio: null,
    };
  }
  const soldPrices: number[] = [];
  const doms: number[] = [];
  let listToSaleNum = 0;
  let listToSaleDen = 0;

  for (const row of rows) {
    const soldPrice =
      readNumber(row, map.sold_price) ?? readNumber(row, map.price);
    const listPrice = readNumber(row, map.list_price);
    const dom = readNumber(row, map.days_on_market);
    if (soldPrice != null) soldPrices.push(soldPrice);
    if (dom != null && dom > 0 && dom < 5000) doms.push(dom);
    if (listPrice != null && soldPrice != null && listPrice > 0) {
      listToSaleNum += soldPrice;
      listToSaleDen += listPrice;
    }
  }

  return {
    median_sale_price:
      soldPrices.length > 0 ? Math.round(median(soldPrices)) : null,
    median_days_on_market: doms.length > 0 ? Math.round(median(doms)) : null,
    list_to_sale_ratio:
      listToSaleDen > 0
        ? Number(((listToSaleNum / listToSaleDen) * 100).toFixed(2))
        : null,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function readString(
  row: Record<string, unknown>,
  key: string | undefined,
): string | undefined {
  if (!key) return undefined;
  const v = row[key];
  if (v == null || v === "") return undefined;
  return String(v).trim();
}

function readNumber(
  row: Record<string, unknown>,
  key: string | undefined,
): number | undefined {
  const s = readString(row, key);
  if (!s) return undefined;
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function readDate(
  row: Record<string, unknown>,
  key: string | undefined,
): number | undefined {
  const s = readString(row, key);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}
