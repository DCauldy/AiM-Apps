import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/hyperlocal/runs/:id/retry
//
// Recover a `failed` run by resetting its phase to the most recent
// human-input checkpoint, so the agent can re-attempt without
// losing the upstream work (discover, service-area, MLS upload).
//
// Target phase is inferred from what's already in the DB:
//   - hl_emails exist                      → "review"  (drafts written, retry send)
//   - segments exist (any status)          → "awaiting_mls" (retry generate)
//   - service-area zips on campaign        → "awaiting_mls" (refresh segments)
//   - nothing                              → "awaiting_service_area"
//
// Clears `error` + `completed_at` so the UI no longer renders the
// failure banner or the run-complete summary.
// ============================================================

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
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, phase, campaign_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.phase !== "failed") {
    return Response.json(
      { error: `Can't retry — run is in ${run.phase}, not failed.` },
      { status: 400 },
    );
  }

  // Inspect downstream state to choose the right resume point.
  const [{ count: emailCount }, { count: segmentCount }] = await Promise.all([
    service
      .from("hl_emails")
      .select("*", { count: "exact", head: true })
      .eq("run_id", id),
    service
      .from("hl_segments")
      .select("*", { count: "exact", head: true })
      .eq("run_id", id),
  ]);

  let targetPhase: string;
  if ((emailCount ?? 0) > 0) {
    targetPhase = "review";
  } else if ((segmentCount ?? 0) > 0) {
    targetPhase = "awaiting_mls";
  } else {
    targetPhase = "awaiting_service_area";
  }

  const { error: updErr } = await service
    .from("hl_runs")
    .update({
      phase: targetPhase,
      error: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  return Response.json({ success: true, phase: targetPhase });
}
