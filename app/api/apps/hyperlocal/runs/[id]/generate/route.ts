import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { triggerGenerate } from "@/lib/hyperlocal/run-pipeline";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/runs/:id/generate
 * Trigger Phase 2 (generate). Requires all pending segments to have an MLS
 * upload.
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

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, phase")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.phase !== "awaiting_mls") {
    return Response.json(
      { error: `Run is in ${run.phase} phase, not awaiting_mls` },
      { status: 400 }
    );
  }

  // After a bulk MLS upload, segments are either:
  //   - ready (had matching MLS rows → will generate)
  //   - skipped (no MLS rows → out of market, ignored)
  //   - pending (user hasn't uploaded anything yet)
  //
  // We block generate only if EVERY segment is still pending — meaning the
  // user hasn't uploaded any MLS data at all.
  const { count: readyCount } = await service
    .from("hl_segments")
    .select("*", { count: "exact", head: true })
    .eq("run_id", id)
    .eq("status", "ready");

  if ((readyCount ?? 0) === 0) {
    return Response.json(
      {
        error:
          "No segments are ready to generate. Upload an MLS export so we can compute market metrics.",
      },
      { status: 400 }
    );
  }

  await service
    .from("hl_runs")
    .update({ phase: "generate", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    await triggerGenerate(id);
  } catch (e) {
    await service
      .from("hl_runs")
      .update({
        phase: "failed",
        error: e instanceof Error ? e.message : "Failed to trigger generate",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return Response.json(
      { error: "Failed to trigger generation" },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
