import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/hyperlocal/runs/:id/back
// Body: { target_phase: "awaiting_service_area" | "awaiting_mls" | "generate" }
//
// Navigate the run back one phase. Each transition cleans up downstream
// state appropriately so the earlier phase's UI re-prompts cleanly:
//
//   awaiting_mls → awaiting_service_area
//     - Delete segments (will be recomputed on new service-area pick)
//     - Clear campaign.service_area_zips so the picker re-shows
//
//   generate → awaiting_mls
//     - Set phase only. Segments + MLS metrics stay valid.
//     - Any in-flight generate job's eventual write is harmless — the
//       phase will already be back at awaiting_mls when it lands; the
//       user can re-trigger generation when ready.
//
//   review → generate
//     - Delete drafts (hl_emails for this run). They'll be regenerated.
//     - Caller is expected to re-trigger generation right after.
//
// Refuses backs from sending/completed/failed/cancelled — those
// transitions either committed external state (sends) or ended the
// run's lifecycle.
// ============================================================

const SAFE_TRANSITIONS = new Map<string, string>([
  ["awaiting_mls", "awaiting_service_area"],
  ["generate", "awaiting_mls"],
  ["review", "generate"],
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetPhase = String(body.target_phase ?? "");

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, phase, campaign_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const expected = SAFE_TRANSITIONS.get(run.phase);
  if (!expected) {
    return Response.json(
      {
        error: `Can't navigate back from "${run.phase}" — no safe earlier phase.`,
      },
      { status: 400 },
    );
  }
  if (targetPhase !== expected) {
    return Response.json(
      {
        error: `Invalid target_phase "${targetPhase}" from "${run.phase}". Expected "${expected}".`,
      },
      { status: 400 },
    );
  }

  // Perform downstream cleanup per transition.
  if (run.phase === "awaiting_mls") {
    // Reset to awaiting_service_area: drop segments + clear campaign zips.
    await service.from("hl_segments").delete().eq("run_id", runId);
    if (run.campaign_id) {
      await service
        .from("hl_campaigns")
        .update({ service_area_zips: [] })
        .eq("id", run.campaign_id);
    }
  } else if (run.phase === "review") {
    // Reset to generate: drop drafts.
    await service.from("hl_emails").delete().eq("run_id", runId);
  }
  // generate → awaiting_mls is a phase-only reset; no row cleanup.

  const { error: updErr } = await service
    .from("hl_runs")
    .update({ phase: targetPhase, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  return Response.json({ success: true, phase: targetPhase });
}
