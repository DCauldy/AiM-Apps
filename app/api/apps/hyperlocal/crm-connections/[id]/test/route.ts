import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { getConnector } from "@/lib/hyperlocal/crm";
import type { HlCrmConnection } from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/crm-connections/:id/test
 * Run the connector's testConnection() and persist last_error / last_synced_at.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Need service role to read encrypted credentials
  const service = createServiceRoleClient();
  const { data: conn, error } = await service
    .from("hl_crm_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!conn) return Response.json({ error: "Not found" }, { status: 404 });

  const connector = getConnector(conn.platform);
  const result = await connector.testConnection(conn as HlCrmConnection);

  await service
    .from("hl_crm_connections")
    .update({
      last_error: result.ok ? null : result.error ?? "Test failed",
      last_synced_at: result.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return Response.json(result);
}
