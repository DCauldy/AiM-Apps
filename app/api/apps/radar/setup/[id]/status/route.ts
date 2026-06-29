import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/apps/radar/setup/[id]/status
//
// Polled by the FirstRunSetup client every ~1.5s while the
// radar-setup-research Trigger.dev task is running. Returns the
// current phase + status + a count of suggested competitors (so the
// UI can show e.g. "5 competitors found" once research completes).
//
// Auth-gated: the requester must own the request row. Service-role
// is used for the actual read so we don't fight RLS on a polling
// hot path.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: row } = await service
    .from("radar_setup_requests")
    .select(
      "id, user_id, hostname, status, phase, research_error, suggested_competitors, requested_at, research_completed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const competitors = Array.isArray(row.suggested_competitors)
    ? row.suggested_competitors
    : [];

  return Response.json({
    id: row.id,
    hostname: row.hostname,
    status: row.status,
    phase: row.phase,
    research_error: row.research_error,
    suggested_competitors_count: competitors.length,
    requested_at: row.requested_at,
    research_completed_at: row.research_completed_at,
  });
}
