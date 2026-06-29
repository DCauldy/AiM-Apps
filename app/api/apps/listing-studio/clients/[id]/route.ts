import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  reserveClientSlot,
  releaseClientSlot,
} from "@/lib/listing-studio/usage";
import type {
  CmaClient,
  CmaClientDetailResponse,
  CmaClientPatchBody,
} from "@/types/cma";

export const dynamic = "force-dynamic";

const MIN_CADENCE_DAYS = 7; // matches the cma_agent_settings CHECK floor

/**
 * GET /api/apps/listing-studio/clients/[id]
 *
 * Returns the client row + delivery history (newest first). Wave 3
 * deliveries are empty for every client — Wave 4 starts populating.
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

  const service = createServiceRoleClient();

  const { data: client, error: clientErr } = await service
    .from("cma_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (clientErr)
    return Response.json({ error: clientErr.message }, { status: 500 });
  if (!client) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: deliveries, error: delErr } = await service
    .from("cma_client_deliveries")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (delErr)
    return Response.json({ error: delErr.message }, { status: 500 });

  const response: CmaClientDetailResponse = {
    client: client as CmaClient,
    deliveries: deliveries ?? [],
  };
  return Response.json(response);
}

/**
 * PATCH /api/apps/listing-studio/clients/[id]
 *
 * Mutations land in one of three buckets:
 *   - Contact/address edits — pure UPDATE.
 *   - Enrollment toggle — routes through reserveClientSlot /
 *     releaseClientSlot (the atomic RPC + immediate clear).
 *   - Pause / cadence / property_facts merge — UPDATE.
 *
 * Enrollment is handled BEFORE other field updates so the cap check
 * fires first. If enrollment fails, the rest of the patch still
 * applies to the row (cadence-only updates shouldn't be blocked by
 * the slot cap).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CmaClientPatchBody;
  try {
    body = (await req.json()) as CmaClientPatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.cadence_days !== undefined &&
    body.cadence_days !== null &&
    body.cadence_days < MIN_CADENCE_DAYS
  ) {
    return Response.json(
      { error: `cadence_days must be at least ${MIN_CADENCE_DAYS}` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // 1. Load current row so we know the prior enrollment state + can
  //    merge property_facts.
  const { data: current, error: loadErr } = await service
    .from("cma_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadErr)
    return Response.json({ error: loadErr.message }, { status: 500 });
  if (!current)
    return Response.json({ error: "Not found" }, { status: 404 });

  // 2. Enrollment transition (must run before the general UPDATE so
  //    the cap check is authoritative).
  let enrollmentWarning: string | null = null;
  if (body.enrolled !== undefined && body.enrolled !== current.enrolled) {
    if (body.enrolled === true) {
      try {
        const result = await reserveClientSlot(user.id, id);
        if (!result.reserved) {
          // Cap reached — keep enrolled=false and surface the limit.
          return Response.json(
            {
              error: "Active-client cap reached. Unenroll someone first or upgrade.",
              active_clients: result.active_clients,
              active_clients_limit: result.active_clients_limit,
            },
            { status: 402 },
          );
        }
      } catch (e) {
        enrollmentWarning =
          e instanceof Error ? e.message : "Enrollment reservation failed";
      }
    } else {
      // Unenroll — best-effort; RPC handles idempotency.
      await releaseClientSlot(user.id, id).catch(() => {});
    }
  }

  // 3. Build the rest of the update. enrolled is already handled above.
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.first_name !== undefined) update.first_name = body.first_name;
  if (body.last_name !== undefined) update.last_name = body.last_name;
  if (body.email !== undefined)
    update.email = body.email?.trim().toLowerCase() || null;
  if (body.phone !== undefined) update.phone = body.phone?.trim() || null;
  if (body.address !== undefined) {
    update.address = body.address?.trim() || null;
    update.address_normalized =
      body.address?.trim().toLowerCase().replace(/\s+/g, " ") || null;
    // Editing the address invalidates the cached property_facts —
    // zpid / lat / lon / image_url were resolved against the old
    // address. Wipe them so the cadence pipeline re-resolves.
    update.property_facts = body.property_facts ?? {};
  } else if (body.property_facts !== undefined) {
    // Partial merge — caller can update individual facts without
    // clobbering the full cached payload.
    update.property_facts = {
      ...(current.property_facts ?? {}),
      ...body.property_facts,
    };
  }
  if (body.paused !== undefined) update.paused = body.paused;
  if (body.cadence_days !== undefined) update.cadence_days = body.cadence_days;

  // Skip the UPDATE entirely when the only change was enrollment.
  const hasOtherFields = Object.keys(update).length > 1; // > 1 because updated_at always present
  if (!hasOtherFields && body.enrolled === undefined) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error: updErr } = hasOtherFields
    ? await service
        .from("cma_clients")
        .update(update)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .single()
    : await service
        .from("cma_clients")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  return Response.json({
    client: updated,
    warning: enrollmentWarning ?? undefined,
  });
}

/**
 * DELETE /api/apps/listing-studio/clients/[id]
 *
 * Drops the row. Does NOT honor as an unsubscribe — agents removing a
 * client because they typed the wrong address shouldn't suppress
 * future re-adds. For CAN-SPAM unsubscribe, the client uses the
 * email's unsubscribe link, which sets unsubscribed_at (Wave 4/5).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("cma_clients")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
