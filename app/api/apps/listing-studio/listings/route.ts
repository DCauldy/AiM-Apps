import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";
import type { ListingRow, ListingStage, PropertyFacts } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/apps/listing-studio/listings?stage=prospect|active|archived
// List the user's listings, newest first. Optional stage filter.
//
// POST /api/apps/listing-studio/listings
// Create a new listing in prospect stage. Body:
//   { address: string, property_facts: PropertyFacts, prefilled_from_api?: boolean }
// ============================================================

export async function GET(req: NextRequest) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const stage = req.nextUrl.searchParams.get("stage") as ListingStage | null;

  let query = supabase
    .from("ls_listings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (stage && ["prospect", "active", "archived"].includes(stage)) {
    query = query.eq("stage", stage);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ listings: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    address,
    property_facts,
    prefilled_from_api,
  } = body as {
    address?: string;
    property_facts?: PropertyFacts;
    prefilled_from_api?: boolean;
  };

  const trimmed = (address ?? "").trim();
  if (!trimmed) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  // Capture the user's active profile so downstream outputs (description,
  // emails) render with the right brand/identity. Falls back to NULL if
  // the user hasn't set one up yet (rare — layout gate handles new users).
  const service = createServiceRoleClient();
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();

  const { data, error } = await service
    .from("ls_listings")
    .insert({
      user_id: user.id,
      profile_id: meta?.active_profile_id ?? null,
      address: trimmed,
      address_normalized: trimmed.toLowerCase(),
      property_facts: property_facts ?? {},
      prefilled_from_api: !!prefilled_from_api,
      stage: "prospect",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ listing: data as ListingRow });
}
