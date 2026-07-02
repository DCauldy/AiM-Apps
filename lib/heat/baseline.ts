import "server-only";

import {
  fetchListingDetail,
  searchSold,
  soldMetricsFromDetail,
  type SearchListingsParams,
} from "./market-data";
import type { MarketBaseline } from "./types";

// ============================================================
// Market baseline — the "compared to what?" for temperature.
//
// Pulls recently-sold comps (last 90 days) in the same ZIP + price band,
// enriches each with its price history, and computes reference medians:
// days-on-market, list-to-sale ratio, price-cut rate, and typical
// views/day. Active listings are then judged HOT/COLD against THIS, not
// just against each other. See HEAT_PLAN.md §2.
// ============================================================

/** Cap provider cost — baseline is a sample, not a census. */
const MAX_COMPS = 25;

function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export async function computeBaseline(
  zip: string,
  band: Pick<SearchListingsParams, "minPrice" | "maxPrice" | "homeTypes">,
): Promise<MarketBaseline> {
  const sold = await searchSold({
    location: zip,
    minPrice: band.minPrice,
    maxPrice: band.maxPrice,
    homeTypes: band.homeTypes,
    soldInLast: "90",
  });

  const comps = sold.slice(0, MAX_COMPS);
  const doms: number[] = [];
  const ratios: number[] = [];
  const viewsPerDay: number[] = [];
  const soldPrices: number[] = [];
  let withCuts = 0;
  let counted = 0;

  for (const c of comps) {
    const dom = c.daysOnZillow ?? 0;
    if (dom > 0 && dom < 5000) doms.push(dom);
    if (c.price) soldPrices.push(c.price);

    const detail = await fetchListingDetail(c.zpid);
    const m = soldMetricsFromDetail(detail);
    if (m.listToSp && m.listToSp > 0.5 && m.listToSp < 1.5) ratios.push(m.listToSp);
    if (m.cutCount > 0) withCuts++;

    const views = detail?.pageViewCount ?? 0;
    if (views > 0 && dom > 0) viewsPerDay.push(views / dom);
    counted++;
  }

  return {
    n: counted,
    medianDom: median(doms),
    medianListToSp: median(ratios),
    pctWithCuts: counted > 0 ? withCuts / counted : null,
    medianViewsPerDay: median(viewsPerDay),
    medianSoldPrice: median(soldPrices),
  };
}
