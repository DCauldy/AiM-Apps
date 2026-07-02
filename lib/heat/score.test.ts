import { describe, expect, it } from "vitest";

import { ZIP_37220_750K_1M } from "./__fixtures__/zip-37220";
import { scoreListings } from "./score";

describe("Heat Score — v1 on real ZIP 37220 data", () => {
  const ranked = scoreListings(ZIP_37220_750K_1M);
  const byAddress = (needle: string) =>
    ranked.find((l) => l.address.includes(needle))!;

  it("prints the ranked hot sheet", () => {
    // Visibility for Milestone A validation.
    // eslint-disable-next-line no-console
    console.table(
      ranked.map((l) => ({
        rank: l.rank,
        heat: l.heatScore,
        address: l.address,
        price: `$${(l.price / 1000).toFixed(0)}k`,
        dom: l.daysOnMarket,
        views: l.views,
        saves: l.saves,
        "s/v%": (l.breakdown.savesToViews * 100).toFixed(1),
        badges: l.badges.join(",") || "—",
      })),
    );
    expect(ranked).toHaveLength(ZIP_37220_750K_1M.length);
  });

  it("anchors the hottest listing at 100 and ranks sequentially", () => {
    expect(ranked[0].heatScore).toBe(100);
    expect(ranked.map((l) => l.rank)).toEqual(
      ranked.map((_, i) => i + 1),
    );
    // Scores are monotonically non-increasing with rank.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].heatScore).toBeLessThanOrEqual(ranked[i - 1].heatScore);
    }
  });

  it("promotes fresh + high-intent listings to the top", () => {
    // 5437 Hill Road Cir: 5.8% save rate, 7 days on market, no cuts.
    // 5401 Forest Acres: 6 days, huge traffic. Both should lead.
    const top3 = ranked.slice(0, 3).map((l) => l.address);
    expect(top3.some((a) => a.includes("Hill Road"))).toBe(true);
    expect(top3.some((a) => a.includes("Forest Acres"))).toBe(true);
  });

  it("demotes the stale-but-popular listing despite highest raw save ratio", () => {
    // 4912 Trousdale has the HIGHEST saves-to-views (7.4%) but 96 days
    // on market + 2 price cuts — it must not rank above a fresh hot one.
    const trousdale = byAddress("Trousdale");
    const hillRoad = byAddress("Hill Road");

    // It genuinely has the top raw ratio...
    const topRatio = Math.max(
      ...ranked.map((l) => l.breakdown.savesToViews),
    );
    expect(trousdale.breakdown.savesToViews).toBe(topRatio);

    // ...yet the score engine ranks it below the fresh leader.
    expect(trousdale.rank).toBeGreaterThan(hillRoad.rank);
    expect(trousdale.badges).toContain("cooling");
  });

  it("flags a value-vs-interest deal watch", () => {
    // At least one below-median-price, high-ratio listing gets Deal Watch.
    expect(ranked.some((l) => l.badges.includes("deal-watch"))).toBe(true);
  });
});

describe("Heat Temperature — absolute, vs a sold-comp baseline", () => {
  // Baseline resembling 37220's recent solds: fast (14 DOM), sells at ask,
  // ~20 views/day typical.
  const baseline = {
    n: 9,
    medianDom: 14,
    medianListToSp: 1.0,
    pctWithCuts: 0.11,
    medianViewsPerDay: 20,
    medianSoldPrice: 850000,
  };
  const ranked = scoreListings(ZIP_37220_750K_1M, { baseline });
  const byAddress = (needle: string) => ranked.find((l) => l.address.includes(needle))!;

  it("assigns a valid temperature tier to every listing", () => {
    const tiers = new Set(["super-hot", "hot", "cool", "cold", "ice-cold"]);
    for (const l of ranked) expect(tiers.has(l.temperature)).toBe(true);
  });

  it("runs fresh, high-traffic homes hot and stale ones cold", () => {
    const hill = byAddress("Hill Road"); // 7 DOM, no cuts, strong demand
    const trousdale = byAddress("Trousdale"); // 96 DOM + 2 cuts

    const hot = new Set(["hot", "super-hot"]);
    const cold = new Set(["cold", "ice-cold", "cool"]);
    expect(hot.has(hill.temperature)).toBe(true);
    expect(cold.has(trousdale.temperature)).toBe(true);
    expect(hill.heatScore).toBeGreaterThan(trousdale.heatScore);
  });
});
