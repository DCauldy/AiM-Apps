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

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/listing-studio/crm-connections/[id]/test
 *
 * Probe the configured credentials by pulling a single contact through
 * the provider's API. Returns either a sample CmaClientCandidate (the
 * first contact that passes the past-client filter AND has an address)
 * or a confirmation that the credentials work but no past clients
 * surfaced in the test sample.
 *
 * Does NOT write anything to cma_clients — pure read-side probe. Does
 * patch last_error on app_crm_connection_state so the connection card
 * can surface the most recent failure even after the user dismisses
 * this response.
 */
export async function POST(
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
  // The connector needs the auth blobs (api_key_encrypted) so we go
  // through getPlatformCrmConnection. The filter lives on the app_state
  // row — load it separately.
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

  const connector = getCmaCrmConnector(platformConn.platform);
  const result = await connector.testConnection(platformConn, filter);

  await setAppCrmSyncState(service, "listing_studio", id, {
    last_error: result.ok ? null : (result.error ?? "Unknown error"),
  });

  return Response.json(result);
}
