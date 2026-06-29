import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/runs/:id/service-area
 * Returns segments sorted by contact_count desc, for the picker UI.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("hl_runs")
    .select("id, campaign_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: segments } = await supabase
    .from("hl_segments")
    .select(
      "id, geo_key, geo_label, geo_type, contact_count, seller_contact_count, buyer_contact_count, below_min_size"
    )
    .eq("run_id", id)
    .order("contact_count", { ascending: false });

  return Response.json({ segments: segments ?? [] });
}

/**
 * POST /api/apps/hyperlocal/runs/:id/service-area
 * Body: { zips: string[], save_as_default?: boolean }
 *
 * - Marks segments NOT in `zips` as 'skipped' (they won't generate)
 * - Optionally saves `zips` back to campaign.service_area_zips as the default
 * - Transitions the run to awaiting_mls (or generate if everything's low-confidence)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const zips = Array.isArray(body.zips)
    ? body.zips
        .map((z: unknown) => String(z).trim().toLowerCase())
        .filter((z: string) => z.length > 0)
    : [];
  const saveAsDefault = body.save_as_default === true;

  if (zips.length === 0) {
    return Response.json(
      { error: "Pick at least one ZIP to continue" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, phase, campaign_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.phase !== "awaiting_service_area") {
    return Response.json(
      {
        error: `Run is in ${run.phase} phase, not awaiting_service_area`,
      },
      { status: 400 }
    );
  }

  // Load all this run's segments
  const { data: allSegments } = await service
    .from("hl_segments")
    .select("id, geo_key, below_min_size")
    .eq("run_id", id);

  const selectedSet = new Set(zips);
  const keepIds: string[] = [];
  const dropIds: string[] = [];
  for (const seg of allSegments ?? []) {
    const key = String(seg.geo_key).trim().toLowerCase();
    if (selectedSet.has(key)) keepIds.push(seg.id);
    else dropIds.push(seg.id);
  }

  // Mark un-selected as skipped
  if (dropIds.length > 0) {
    await service
      .from("hl_segments")
      .update({ status: "skipped" })
      .in("id", dropIds);
  }

  // For the selected sub-threshold segments, leave them as 'ready' so they
  // can generate without MLS data. Full-size selected segments stay 'pending'.

  // Optionally persist as default on the campaign
  if (saveAsDefault && run.campaign_id) {
    await service
      .from("hl_campaigns")
      .update({
        service_area_zips: zips,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.campaign_id);
  }

  // Decide next phase: do any selected full-size segments need MLS?
  const { count: pendingCount } = await service
    .from("hl_segments")
    .select("*", { count: "exact", head: true })
    .eq("run_id", id)
    .eq("status", "pending");

  const nextPhase = (pendingCount ?? 0) > 0 ? "awaiting_mls" : "generate";

  await service
    .from("hl_runs")
    .update({
      phase: nextPhase,
      segments_count: keepIds.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // If we're skipping straight to generate (all low-confidence), kick off
  if (nextPhase === "generate") {
    // Same trigger as awaiting_mls → generate path
    const { triggerGenerate } = await import("@/lib/hyperlocal/run-pipeline");
    await triggerGenerate(id);
  }

  return Response.json({
    selected: keepIds.length,
    skipped: dropIds.length,
    saved_as_default: saveAsDefault,
    next_phase: nextPhase,
  });
}
