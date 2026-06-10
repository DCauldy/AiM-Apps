import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import {
  reserveActiveListingSlot,
  refundActiveListingSlot,
} from "@/lib/listing-studio/usage";
import { NextRequest } from "next/server";
import type { ListingRow, PromoteListingResponse } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/listing-studio/listings/[id]/promote
// Flip a prospect listing to active. This is the slot-consuming event.
//
// Atomic flow:
//   1. Reserve via try_reserve_active_listing_slot RPC (serializes via
//      SELECT … FOR UPDATE)
//   2. UPDATE the listing row to stage='active'
//   3. If step 2 fails, refund the slot
//
// 429 with usage info when the cap is hit.
// ============================================================

export async function POST(
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

  const service = createServiceRoleClient();

  // Verify ownership + current stage before consuming a slot.
  const { data: listing } = await service
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.stage === "active") {
    return Response.json({ error: "Listing is already active" }, { status: 400 });
  }
  if (listing.stage === "archived") {
    return Response.json(
      { error: "Cannot promote an archived listing" },
      { status: 400 },
    );
  }

  // Atomic reserve.
  const reservation = await reserveActiveListingSlot(user.id);
  if (!reservation.reserved) {
    return Response.json(
      {
        error: "Monthly active-listing limit reached",
        code: "pack_limit_reached",
        usage: {
          activeListingsPromoted: reservation.active_listings_promoted,
          activeListingsLimit: reservation.active_listings_limit,
        },
      },
      { status: 429 },
    );
  }

  // Flip stage. Refund if the write fails.
  const promotedAt = new Date().toISOString();
  const { data, error } = await service
    .from("ls_listings")
    .update({
      stage: "active",
      promoted_at: promotedAt,
      updated_at: promotedAt,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    await refundActiveListingSlot(user.id).catch(() => {});
    return Response.json(
      { error: error?.message ?? "Failed to promote listing" },
      { status: 500 },
    );
  }

  const response: PromoteListingResponse = {
    listing: data as ListingRow,
    usage: {
      activeListingsPromoted: reservation.active_listings_promoted,
      activeListingsLimit: reservation.active_listings_limit,
    },
  };
  return Response.json(response);
}
