import type { MlsMetrics } from "@/types/hyperlocal";
import { detectMlsColumns } from "./parser";

/**
 * Compute metric snapshot for a slice of MLS rows.
 * Handles missing/malformed columns gracefully by skipping rows.
 *
 * Pass `columnMap` to override auto-detection — used when the user
 * has confirmed/adjusted the column mapping via the upload modal.
 * Without it we fall back to the heuristic.
 */
export function computeMetrics(
  rows: Record<string, unknown>[],
  columns: string[],
  columnMap?: ReturnType<typeof detectMlsColumns>,
): MlsMetrics {
  if (rows.length === 0) return {};
  const map = columnMap ?? detectMlsColumns(columns);

  const now = Date.now();
  const day = 86_400_000;

  const soldPrices: number[] = [];
  const listPrices: number[] = [];
  const domValues: number[] = [];
  let activeCount = 0;
  let closed30 = 0;
  let closed90 = 0;
  let newListings30 = 0;
  let listToSaleNum = 0;
  let listToSaleDen = 0;

  for (const row of rows) {
    const status = readString(row, map.status)?.toLowerCase() ?? "";
    const soldPrice =
      readNumber(row, map.sold_price) ??
      (status.includes("sold") || status.includes("closed")
        ? readNumber(row, map.price)
        : undefined);
    const listPrice = readNumber(row, map.list_price);
    const closedDate = readDate(row, map.closed_date);
    const listDate = readDate(row, map.list_date);
    const dom = readNumber(row, map.days_on_market);

    if (status.includes("active")) activeCount++;
    if (closedDate) {
      const diff = now - closedDate;
      if (diff <= 30 * day) closed30++;
      if (diff <= 90 * day) closed90++;
      if (soldPrice != null) soldPrices.push(soldPrice);
      if (listPrice != null && soldPrice != null && listPrice > 0) {
        listToSaleNum += soldPrice;
        listToSaleDen += listPrice;
      }
    }
    if (listDate && now - listDate <= 30 * day) newListings30++;
    if (listPrice != null) listPrices.push(listPrice);
    if (dom != null && dom > 0 && dom < 5000) domValues.push(dom);
  }

  const result: MlsMetrics = {};
  if (soldPrices.length > 0)
    result.median_sale_price = Math.round(median(soldPrices));
  if (domValues.length > 0)
    result.median_days_on_market = Math.round(median(domValues));
  if (listToSaleDen > 0)
    result.list_to_sale_ratio = Number(
      ((listToSaleNum / listToSaleDen) * 100).toFixed(1)
    );
  if (activeCount > 0) result.inventory_active = activeCount;
  if (closed30 > 0) result.closed_last_30_days = closed30;
  if (closed90 > 0) result.closed_last_90_days = closed90;
  if (newListings30 > 0) result.new_listings_last_30_days = newListings30;

  return result;
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
  key: string | undefined
): string | undefined {
  if (!key) return undefined;
  const v = row[key];
  if (v == null || v === "") return undefined;
  return String(v).trim();
}

function readNumber(
  row: Record<string, unknown>,
  key: string | undefined
): number | undefined {
  const s = readString(row, key);
  if (!s) return undefined;
  // Strip $ , and whitespace
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function readDate(
  row: Record<string, unknown>,
  key: string | undefined
): number | undefined {
  const s = readString(row, key);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}
