import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { heatEnrichTask } from "@/triggers/heat-enrich";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/apps/heat/search
 *
 * Body: { zips: string[], minPrice?, maxPrice?, homeTypes?, mode?, audience?, weights? }
 * Creates a heat_searches row, kicks the heat-enrich task, and returns
 * { id, runId }. The board polls GET /searches/[id] until status = ready.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    zips?: unknown;
    minPrice?: number | null;
    maxPrice?: number | null;
    homeTypes?: string | null;
    mode?: "magic" | "control";
    audience?: "buyer" | "listing";
    weights?: Record<string, number> | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const zips = Array.isArray(body.zips)
    ? body.zips.map((z) => String(z).trim()).filter(Boolean)
    : [];
  if (zips.length === 0) {
    return Response.json({ error: "At least one ZIP code is required." }, { status: 400 });
  }
  if (zips.length > 5) {
    return Response.json({ error: "Up to 5 ZIP codes per search." }, { status: 400 });
  }

  const { data: search, error } = await supabase
    .from("heat_searches")
    .insert({
      user_id: user.id,
      zips,
      min_price: body.minPrice ?? null,
      max_price: body.maxPrice ?? null,
      home_types: body.homeTypes ?? null,
      mode: body.mode === "control" ? "control" : "magic",
      audience: body.audience === "listing" ? "listing" : "buyer",
      weights: body.weights ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !search) {
    console.error("heat search insert failed:", error);
    return Response.json({ error: "Couldn't start the search." }, { status: 500 });
  }

  try {
    const handle = await tasks.trigger<typeof heatEnrichTask>("heat-enrich", {
      searchId: search.id,
      userId: user.id,
    });
    return Response.json({ id: search.id, runId: handle.id });
  } catch (err) {
    console.error("heat-enrich trigger failed:", err);
    await supabase
      .from("heat_searches")
      .update({ status: "error", error: "Could not start enrichment" })
      .eq("id", search.id);
    return Response.json({ error: "Couldn't start the search." }, { status: 500 });
  }
}
