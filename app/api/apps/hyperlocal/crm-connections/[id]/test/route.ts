import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  getPlatformCrmConnection,
  setAppCrmSyncState,
} from "@/lib/platform/connections";
import { NextRequest } from "next/server";
import { getConnector } from "@/lib/hyperlocal/crm";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/crm-connections/:id/test
 * Run the connector's testConnection() and persist last_error / last_synced_at
 * on app_crm_connection_state.
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

  // Need service role to read encrypted credentials on the platform row.
  const service = createServiceRoleClient();
  const conn = await getPlatformCrmConnection(service, user.id, id);
  if (!conn) return Response.json({ error: "Not found" }, { status: 404 });

  const connector = getConnector(conn.platform);
  const result = await connector.testConnection(conn);

  await setAppCrmSyncState(service, "hyperlocal", id, {
    last_error: result.ok ? null : (result.error ?? "Test failed"),
    last_synced_at: result.ok ? new Date().toISOString() : null,
  });

  return Response.json(result);
}
