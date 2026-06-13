import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCmaCrmConnector } from "@/lib/listing-studio/crm";
import {
  getAppCrmConnection,
  getPlatformCrmConnection,
  setAppCrmSyncState,
} from "@/lib/platform/connections";
import type { CmaCrmFilterConfig } from "@/types/platform-connections";
import type {
  CmaClientCandidate,
  CmaCrmSyncResponse,
} from "@/types/cma";

export const dynamic = "force-dynamic";

// Hard cap on candidates we'll ingest in a single sync call. The CRM
// connectors page through with their own cap of 25k, which is enough
// for any realistic past-client list but bounds the worst case.
const FETCH_LIMIT = 25_000;
const PREVIEW_SIZE = 10;

/**
 * POST /api/apps/listing-studio/crm-connections/[id]/sync
 *
 * Pull past-client candidates from the connected CRM and upsert them
 * into cma_clients. New candidates land with enrolled = false; the
 * agent reviews + enrolls explicitly via the /clients UI (Wave 3).
 *
 * Returns CmaCrmSyncResponse with counts + a preview slice. Updates
 * last_synced_at / last_error on the app_crm_connection_state row.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  // Load auth + app state separately — auth blobs only live on the
  // shared platform row, filter config only on the per-app state.
  const platformConn = await getPlatformCrmConnection(service, user.id, id);
  if (!platformConn)
    return Response.json({ error: "Not found" }, { status: 404 });
  const appConn = await getAppCrmConnection(
    service,
    user.id,
    "listing_studio",
    id,
  );
  if (!appConn) return Response.json({ error: "Not found" }, { status: 404 });

  const filter: CmaCrmFilterConfig = appConn.state.filter_config ?? {};

  let candidates: CmaClientCandidate[];
  try {
    const connector = getCmaCrmConnector(platformConn.platform);
    candidates = await connector.fetchPastClients(platformConn, filter, {
      limit: FETCH_LIMIT,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setAppCrmSyncState(service, "listing_studio", id, {
      last_error: message.slice(0, 500),
    });
    return Response.json({ error: message }, { status: 502 });
  }

  // Upsert each candidate. The partial unique on
  // (user_id, crm_connection_id, crm_contact_id) guarantees we
  // collide on existing rows by crm_contact_id. We can't use
  // PostgREST's `.upsert(..., { onConflict })` with a partial unique
  // (PostgREST needs a concrete constraint name), so do explicit
  // SELECT-then-INSERT/UPDATE per candidate. This bottlenecks at large
  // past-client lists (~1k+ contacts) but is fine for v2 — we'll
  // batch-optimize in Wave 6 when we know the actual scale.
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const cand of candidates) {
    const { data: existing } = await service
      .from("cma_clients")
      .select("id, first_name, last_name, email, phone, address, address_normalized")
      .eq("user_id", user.id)
      .eq("crm_connection_id", id)
      .eq("crm_contact_id", cand.crm_contact_id)
      .maybeSingle();

    if (existing) {
      const changed =
        existing.first_name !== cand.first_name ||
        existing.last_name !== cand.last_name ||
        existing.email !== cand.email ||
        (existing.phone ?? null) !== (cand.phone ?? null) ||
        existing.address !== cand.address ||
        existing.address_normalized !== cand.address_normalized;
      if (changed) {
        await service
          .from("cma_clients")
          .update({
            first_name: cand.first_name,
            last_name: cand.last_name,
            email: cand.email,
            phone: cand.phone ?? null,
            address: cand.address,
            address_normalized: cand.address_normalized,
            updated_at: now,
          })
          .eq("id", existing.id);
        updated += 1;
      }
    } else {
      await service.from("cma_clients").insert({
        user_id: user.id,
        profile_id: platformConn.profile_id,
        crm_connection_id: id,
        crm_contact_id: cand.crm_contact_id,
        source: "crm",
        first_name: cand.first_name,
        last_name: cand.last_name,
        email: cand.email,
        phone: cand.phone ?? null,
        address: cand.address,
        address_normalized: cand.address_normalized,
        property_facts: {},
        enrolled: false,
      });
      created += 1;
    }
  }

  await setAppCrmSyncState(service, "listing_studio", id, {
    last_synced_at: now,
    last_error: null,
  });

  const response: CmaCrmSyncResponse = {
    candidates_total: candidates.length,
    candidates_created: created,
    candidates_updated: updated,
    // dropped tracking deferred to Wave 6 (needs a 3-way diff against
    // the prior sync's candidate set).
    candidates_dropped: 0,
    preview: candidates.slice(0, PREVIEW_SIZE),
  };
  return Response.json(response);
}
