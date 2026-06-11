import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCmaCrmConnector } from "@/lib/listing-studio/crm";
import type { CmaCrmConnection } from "@/types/cma";

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
 * Does NOT write anything — pure read-side probe. Errors surface
 * verbatim from the connector so the agent can act on "401 invalid
 * API key" vs "no contacts match your stage filter."
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
  const { data: conn, error } = await service
    .from("cma_crm_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!conn) return Response.json({ error: "Not found" }, { status: 404 });

  const connector = getCmaCrmConnector(conn.platform);
  const result = await connector.testConnection(conn as CmaCrmConnection);

  // Persist last_error so the connection card can surface the most
  // recent failure even after the user dismisses this response.
  await service
    .from("cma_crm_connections")
    .update({
      last_error: result.ok ? null : (result.error ?? "Unknown error"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return Response.json(result);
}
