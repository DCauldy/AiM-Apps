import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { runCmaCrmSync } from "@/lib/listing-studio/crm/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/listing-studio/crm-connections/[id]/sync
 *
 * Pull past-client candidates from the connected CRM and upsert them
 * into cma_clients. New candidates land with enrolled = false; the
 * agent reviews + enrolls explicitly via the /clients UI.
 *
 * Thin wrapper around runCmaCrmSync — the same helper the Inngest
 * auto-sync trigger calls, so manual and automatic syncs share one
 * implementation.
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
  try {
    const response = await runCmaCrmSync(service, {
      userId: user.id,
      connectionId: id,
    });
    return Response.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const status = message.includes("not found") ? 404 : 502;
    return Response.json({ error: message }, { status });
  }
}
