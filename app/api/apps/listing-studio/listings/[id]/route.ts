import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";
import type { ListingRow, PropertyFacts } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// GET    /api/apps/listing-studio/listings/[id]   single listing
// PATCH  /api/apps/listing-studio/listings/[id]   edit (facts, notes, archive)
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ listing: data as ListingRow });
}

// PATCH allowlist — keeps stage transitions out of this route (use /promote
// or /archive endpoints with their own gating).
const ALLOWED_PATCH_FIELDS = new Set([
  "address",
  "property_facts",
  "notes",
  "profile_id",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_PATCH_FIELDS.has(k)) updates[k] = v;
  }

  if (typeof updates.address === "string") {
    updates.address = (updates.address as string).trim();
    updates.address_normalized = (updates.address as string).toLowerCase();
  }
  if (typeof updates.property_facts !== "undefined") {
    updates.property_facts = (updates.property_facts as PropertyFacts) ?? {};
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no editable fields supplied" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("ls_listings")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ listing: data as ListingRow });
}
