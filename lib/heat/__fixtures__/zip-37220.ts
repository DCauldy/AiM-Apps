// Real data pulled from us-housing-market-data (Zillow) on 2026-07-01:
// ZIP 37220 (Nashville, TN), for-sale, $750k–$1M.
// views = pageViewCount, saves = favoriteCount, from the /property detail payloads.
// priceCutCount derived from priceHistory (downward "Price change" events).

import type { HeatListing } from "../types";

export const ZIP_37220_750K_1M: HeatListing[] = [
  { zpid: "55295554", address: "5117 Glencarron Dr", price: 750000, beds: 4, baths: 3, livingArea: 2332, daysOnMarket: 55, views: 553, saves: 16, priceCutCount: 1 },
  { zpid: "41175350", address: "4912 Trousdale Dr", price: 774900, beds: 3, baths: 3, livingArea: 1518, daysOnMarket: 96, views: 1244, saves: 92, priceCutCount: 2 },
  { zpid: "41175152", address: "707 Farrell Rd", price: 795000, beds: 3, baths: 2, livingArea: 1722, daysOnMarket: 71, views: 529, saves: 20, priceCutCount: 1 },
  { zpid: "41192208", address: "827 Redwood Dr", price: 800000, beds: 3, baths: 3, livingArea: 2701, daysOnMarket: 12, views: 1030, saves: 27, priceCutCount: 0 },
  { zpid: "41192623", address: "5401 Forest Acres Dr", price: 829500, beds: 4, baths: 3, livingArea: 2450, daysOnMarket: 6, views: 927, saves: 37, priceCutCount: 0 },
  { zpid: "41175503", address: "5048 Ragland Dr", price: 837500, beds: 3, baths: 2, livingArea: 1962, daysOnMarket: 88, views: 536, saves: 21, priceCutCount: 0 },
  { zpid: "41192789", address: "604 Songwriter Cir", price: 850000, beds: 3, baths: 3, livingArea: 2840, daysOnMarket: 45, views: 548, saves: 18, priceCutCount: 0 },
  { zpid: "41192521", address: "505 Dillard Ct", price: 899900, beds: 3, baths: 2, livingArea: 2230, daysOnMarket: 16, views: 978, saves: 32, priceCutCount: 0 },
  { zpid: "41175892", address: "5157 Regent Dr", price: 929000, beds: 3, baths: 2, livingArea: 2240, daysOnMarket: 63, views: 943, saves: 52, priceCutCount: 1 },
  { zpid: "41192741", address: "481 Broadwell Dr", price: 945000, beds: 4, baths: 2, livingArea: 2559, daysOnMarket: 11, views: 465, saves: 21, priceCutCount: 0 },
  { zpid: "41192758", address: "5437 Hill Road Cir", price: 950000, beds: 4, baths: 3, livingArea: 2455, daysOnMarket: 7, views: 762, saves: 44, priceCutCount: 0 },
];
