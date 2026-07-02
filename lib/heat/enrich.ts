import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

import { computeBaseline } from "./baseline";
import {
  fetchListingDetail,
  priceCutCount,
  searchListings,
  toHeatListing,
} from "./market-data";
import { scoreListings } from "./score";
import { DEFAULT_WEIGHTS, type HeatListing, type HeatWeights } from "./types";

// ============================================================
// Heat enrichment — the demand pass behind a search.
//
//   1. propertyExtendedSearch per ZIP        → candidate for-sale listings
//   2. cache-first /property per candidate    → views/saves/priceHistory
//   3. persist heat_listings + today's snapshot
//   4. scoreListings → persist ranked heat_search_results
//   5. mark the search ready
//
// Runs inside the Trigger.dev heat-enrich task (off the request path;
// ~600ms/listing). Cache-first: a listing enriched < 24h ago is reused,
// so re-running / overlapping searches don't re-hit the provider.
// ============================================================

/** Bound provider cost per run — enrich at most this many listings. */
const MAX_ENRICH = 40;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type ProgressFn = (step: string, progress: number) => void;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runHeatEnrich(
  searchId: string,
  onProgress: ProgressFn = () => {},
): Promise<{ ok: boolean; count: number }> {
  const supabase = createServiceRoleClient();

  const { data: search, error: loadErr } = await supabase
    .from("heat_searches")
    .select("id, zips, min_price, max_price, home_types, weights")
    .eq("id", searchId)
    .single();

  if (loadErr || !search) {
    throw new Error(`heat search ${searchId} not found: ${loadErr?.message}`);
  }

  const weights: HeatWeights = (search.weights as HeatWeights) ?? DEFAULT_WEIGHTS;

  onProgress("Finding listings…", 10);

  // 1. Search every ZIP, dedupe by zpid.
  const candidates = new Map<string, Awaited<ReturnType<typeof searchListings>>[number]>();
  for (const zip of search.zips as string[]) {
    const props = await searchListings({
      location: zip,
      minPrice: search.min_price,
      maxPrice: search.max_price,
      homeTypes: search.home_types ?? undefined,
    });
    for (const p of props) if (p.zpid) candidates.set(p.zpid, p);
  }

  const props = [...candidates.values()].slice(0, MAX_ENRICH);
  onProgress(`Reading demand for ${props.length} listings…`, 30);

  // 2. Enrich each (cache-first), building the scorer input.
  const listings: HeatListing[] = [];
  const day = today();
  let done = 0;

  for (const prop of props) {
    const { data: cached } = await supabase
      .from("heat_listings")
      .select("page_view_count, favorite_count, price_cut_count, last_enriched_at")
      .eq("zpid", prop.zpid)
      .maybeSingle();

    const fresh =
      cached?.last_enriched_at &&
      Date.now() - new Date(cached.last_enriched_at).getTime() < CACHE_TTL_MS;

    let views = cached?.page_view_count ?? 0;
    let saves = cached?.favorite_count ?? 0;
    let cuts = cached?.price_cut_count ?? 0;

    if (!fresh) {
      const detail = await fetchListingDetail(prop.zpid);
      views = detail?.pageViewCount ?? 0;
      saves = detail?.favoriteCount ?? 0;
      cuts = priceCutCount(detail);

      // Upsert the market cache (latest demand) …
      await supabase.from("heat_listings").upsert({
        zpid: prop.zpid,
        address: prop.address ?? null,
        zip: (search.zips as string[])[0] ?? null,
        price: prop.price ?? null,
        beds: prop.bedrooms ?? null,
        baths: prop.bathrooms ?? null,
        living_area: prop.livingArea ?? null,
        days_on_market: prop.daysOnZillow ?? null,
        property_type: prop.propertyType ?? null,
        img_src: prop.imgSrc ?? null,
        detail_url: prop.detailUrl ?? null,
        page_view_count: views,
        favorite_count: saves,
        price_cut_count: cuts,
        last_enriched_at: new Date().toISOString(),
      });

      // … and append today's history point (idempotent per zpid/day).
      await supabase
        .from("heat_listing_snapshots")
        .upsert(
          {
            zpid: prop.zpid,
            captured_on: day,
            page_view_count: views,
            favorite_count: saves,
            price: prop.price ?? null,
          },
          { onConflict: "zpid,captured_on" },
        );
    }

    listings.push({
      ...toHeatListing(prop, null),
      views,
      saves,
      priceCutCount: cuts,
    });

    done++;
    onProgress(`Reading demand… (${done}/${props.length})`, 30 + Math.round((done / props.length) * 50));
  }

  // 3. Baseline: what actually sold here in the last 90 days.
  onProgress("Benchmarking against recent sales…", 82);
  const baseline = await computeBaseline((search.zips as string[])[0], {
    minPrice: search.min_price,
    maxPrice: search.max_price,
    homeTypes: search.home_types ?? undefined,
  }).catch(() => null);

  // 4. Score + rank against the baseline, then persist results.
  onProgress("Scoring…", 92);
  const ranked = scoreListings(listings, { weights, baseline });

  // Replace any prior results for this search.
  await supabase.from("heat_search_results").delete().eq("search_id", searchId);
  if (ranked.length > 0) {
    await supabase.from("heat_search_results").insert(
      ranked.map((l) => ({
        search_id: searchId,
        zpid: l.zpid,
        heat_score: l.heatScore,
        temperature: l.temperature,
        score_breakdown: l.breakdown,
        badges: l.badges,
        rank: l.rank,
      })),
    );
  }

  await supabase
    .from("heat_searches")
    .update({
      status: "ready",
      baseline,
      updated_at: new Date().toISOString(),
    })
    .eq("id", searchId);

  onProgress("Done", 100);
  return { ok: true, count: ranked.length };
}
