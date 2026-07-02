import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/apps/heat/searches/[id]
 *
 * Returns the search status plus its ranked results joined to the listing
 * cache. RLS scopes both to the owner. The board polls this until
 * status = "ready" (or "error").
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: search, error } = await supabase
    .from("heat_searches")
    .select(
      "id, zips, min_price, max_price, home_types, mode, audience, status, error, baseline, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!search) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("heat_search_results")
    .select(
      `rank, heat_score, temperature, badges, score_breakdown, blurb, zpid,
       listing:heat_listings (
         zpid, address, city, state, zip, price, beds, baths, living_area,
         days_on_market, property_type, img_src, detail_url,
         page_view_count, favorite_count, price_cut_count
       )`,
    )
    .eq("search_id", id)
    .order("rank", { ascending: true });

  const results = (rows ?? []).map((r) => {
    const rawListing = (r as { listing?: unknown }).listing;
    const l = (Array.isArray(rawListing) ? rawListing[0] : rawListing ?? {}) as Record<
      string,
      unknown
    >;
    return {
      rank: r.rank,
      heatScore: r.heat_score,
      temperature: r.temperature ?? null,
      badges: r.badges ?? [],
      breakdown: r.score_breakdown,
      blurb: r.blurb,
      zpid: r.zpid,
      address: l.address ?? null,
      price: l.price ?? null,
      beds: l.beds ?? null,
      baths: l.baths ?? null,
      livingArea: l.living_area ?? null,
      daysOnMarket: l.days_on_market ?? null,
      imgSrc: l.img_src ?? null,
      detailUrl: l.detail_url ?? null,
      views: l.page_view_count ?? null,
      saves: l.favorite_count ?? null,
    };
  });

  return Response.json({ search, results });
}
