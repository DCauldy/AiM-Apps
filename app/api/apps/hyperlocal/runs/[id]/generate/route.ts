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

  // Trigger first; advance phase only on a confirmed send. Previous
  // version flipped phase to "generate" optimistically then marked the
  // run as `failed` on send error — too destructive for what's almost
  // always a transient Inngest issue (missing env var, dev server not
  // running). Leaving phase as awaiting_mls means the user can hit
  // "Generate" again after fixing the root cause.
  try {
    await triggerGenerate(id);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to trigger generate";
    console.error("[generate] triggerGenerate failed:", message, e);
    return Response.json(
      {
        error: `Couldn't send the generate job to Inngest: ${message}. ` +
          "Check INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY env vars and that " +
          "the Inngest dev server (or production endpoint) is reachable. " +
          "Run is still in awaiting_mls — fix the issue and retry.",
      },
      { status: 500 },
    );
  }

  await service
    .from("hl_runs")
    .update({ phase: "generate", updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json({ success: true });
}
