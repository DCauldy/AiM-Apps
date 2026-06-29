import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAppCrmConnection,
  getPlatformCrmConnection,
  setAppCrmSyncState,
} from "@/lib/platform/connections";
import { getCmaCrmConnector } from "@/lib/listing-studio/crm";
import type { CmaCrmFilterConfig } from "@/types/platform-connections";
import type {
  CmaClientCandidate,
  CmaCrmSyncResponse,
} from "@/types/cma";

const FETCH_LIMIT = 25_000;
const PREVIEW_SIZE = 10;

export interface RunCmaCrmSyncInput {
  userId: string;
  connectionId: string;
}

/**
 * Pull past-client candidates from the connected CRM and upsert them into
 * cma_clients. Used by both the manual /sync route and the auto-trigger
 * Inngest function that fires after a profile-level CRM connect.
 *
 * Returns the sync response or throws on connector failure (caller is
 * responsible for surfacing the error — last_error is already written
 * onto app_crm_connection_state before the throw).
 */
export async function runCmaCrmSync(
  service: SupabaseClient,
  input: RunCmaCrmSyncInput,
): Promise<CmaCrmSyncResponse> {
  const { userId, connectionId } = input;

  const platformConn = await getPlatformCrmConnection(
    service,
    userId,
    connectionId,
  );
  if (!platformConn) throw new Error(`CRM connection ${connectionId} not found`);

  const appConn = await getAppCrmConnection(
    service,
    userId,
    "listing_studio",
    connectionId,
  );
  if (!appConn)
    throw new Error(
      `listing_studio app state for connection ${connectionId} not found`,
    );

  const filter: CmaCrmFilterConfig = appConn.state.filter_config ?? {};

  let candidates: CmaClientCandidate[];
  try {
    const connector = getCmaCrmConnector(platformConn.platform);
    candidates = await connector.fetchPastClients(platformConn, filter, {
      limit: FETCH_LIMIT,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setAppCrmSyncState(service, "listing_studio", connectionId, {
      last_error: message.slice(0, 500),
    });
    throw new Error(message);
  }

  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const cand of candidates) {
    const { data: existing } = await service
      .from("cma_clients")
      .select(
        "id, first_name, last_name, email, phone, address, address_normalized",
      )
      .eq("user_id", userId)
      .eq("crm_connection_id", connectionId)
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
        user_id: userId,
        profile_id: platformConn.profile_id,
        crm_connection_id: connectionId,
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

  await setAppCrmSyncState(service, "listing_studio", connectionId, {
    last_synced_at: now,
    last_error: null,
  });

  return {
    candidates_total: candidates.length,
    candidates_created: created,
    candidates_updated: updated,
    candidates_dropped: 0,
    preview: candidates.slice(0, PREVIEW_SIZE),
  };
}
