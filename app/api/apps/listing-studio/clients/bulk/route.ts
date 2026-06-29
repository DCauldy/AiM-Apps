import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  reserveClientSlot,
  releaseClientSlot,
} from "@/lib/listing-studio/usage";
import type {
  CmaClientBulkAction,
  CmaClientBulkRequest,
  CmaClientBulkResponse,
} from "@/types/cma";

export const dynamic = "force-dynamic";

const MIN_CADENCE_DAYS = 7;
const MAX_BULK_SIZE = 500; // bounds the worst-case enrollment loop

const ALLOWED_ACTIONS: ReadonlySet<CmaClientBulkAction> = new Set([
  "enroll",
  "unenroll",
  "pause",
  "resume",
]);

/**
 * POST /api/apps/listing-studio/clients/bulk
 *
 * Apply the same action to many clients in one request — the agent's
 * primary tool after a CRM sync ("review 250 candidates, enroll the
 * 180 I recognize"). Iterates serially through the atomic slot RPC
 * for enroll so the cap is honored exactly; clients beyond the cap
 * land in `failed`.
 *
 * For non-enroll actions a single UPDATE handles the whole batch.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CmaClientBulkRequest;
  try {
    body = (await req.json()) as CmaClientBulkRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.client_ids) ? body.client_ids.filter(Boolean) : [];
  if (ids.length === 0)
    return Response.json({ error: "client_ids is required" }, { status: 400 });
  if (ids.length > MAX_BULK_SIZE)
    return Response.json(
      { error: `Up to ${MAX_BULK_SIZE} clients per bulk call.` },
      { status: 400 },
    );

  if (!ALLOWED_ACTIONS.has(body.action)) {
    return Response.json(
      { error: "action must be one of: enroll, unenroll, pause, resume" },
      { status: 400 },
    );
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
  const result: CmaClientBulkResponse = { ok: [], failed: [] };

  switch (body.action) {
    case "enroll": {
      // Serial atomic enrollment — required so the cap check is
      // authoritative. Cap-exceeded errors collect in `failed` with
      // a clear reason; the rest of the batch keeps going.
      for (const id of ids) {
        try {
          const res = await reserveClientSlot(user.id, id);
          if (!res.reserved) {
            result.failed.push({
              id,
              error: `Cap reached (${res.active_clients}/${res.active_clients_limit})`,
            });
            // Once cap hit, every subsequent reserve fails the same way.
            // Short-circuit the rest of the batch as "cap" — saves
            // hundreds of round-trips when the agent picked too many.
            for (const remaining of ids.slice(ids.indexOf(id) + 1)) {
              result.failed.push({ id: remaining, error: "Cap reached" });
            }
            break;
          }
          // cadence_days update piggybacks on the enrollment write.
          if (body.cadence_days !== undefined) {
            await service
              .from("cma_clients")
              .update({
                cadence_days: body.cadence_days,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id)
              .eq("user_id", user.id);
          }
          result.ok.push(id);
        } catch (e) {
          result.failed.push({
            id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      break;
    }

    case "unenroll": {
      // Single UPDATE — no cap math, just flip enrolled=false.
      const { data, error } = await service
        .from("cma_clients")
        .update({ enrolled: false, updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("user_id", user.id)
        .select("id");
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      const okIds = new Set((data ?? []).map((r) => r.id));
      for (const id of ids) {
        if (okIds.has(id)) result.ok.push(id);
        else result.failed.push({ id, error: "Not found" });
      }
      // Best-effort release call — RPC is idempotent so missed
      // entries cause no harm.
      await Promise.all(ids.map((id) => releaseClientSlot(user.id, id).catch(() => {})));
      break;
    }

    case "pause":
    case "resume": {
      const { data, error } = await service
        .from("cma_clients")
        .update({
          paused: body.action === "pause",
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("user_id", user.id)
        .select("id");
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      const okIds = new Set((data ?? []).map((r) => r.id));
      for (const id of ids) {
        if (okIds.has(id)) result.ok.push(id);
        else result.failed.push({ id, error: "Not found" });
      }
      break;
    }
  }

  return Response.json(result);
}
