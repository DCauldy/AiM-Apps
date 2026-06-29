import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "tier",
  "size",
  "frequency",
  "price_cents",
  "stripe_price_id",
  "stripe_product_id",
  "label",
  "best_value",
  "is_active",
  "sort_order",
];

// Admin manages Stripe Products + Prices manually in the Stripe Dashboard
// and pastes the Price ID into the admin UI. This route just persists what
// the admin types — no auto-create, no archive of old Prices, no Stripe
// API calls from here. Keeps the route immune to API key issues and gives
// admins full control over Stripe-side product naming, metadata, tax,
// trials, etc.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packId } = await params;
  const body = await req.json();

  // Whitelist allowed fields
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();
  updates.updated_by = user.id;

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("admin_pack_configs")
    .update(updates)
    .eq("id", packId)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Pack not found" }, { status: 404 });
  }

  return Response.json(data);
}
