import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { triggerDiscover } from "@/lib/hyperlocal/run-pipeline";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import { resolveSphereCrmConnectionId } from "@/lib/hyperlocal/sphere";
import { getDefaultAppEmailConnection } from "@/lib/platform/connections";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/campaigns/[id]/run
 *
 * One-click "Run" for a saved campaign: resolves the profile's default CRM +
 * email sender and launches a run into the Magic experience — no launcher
 * dialog. Returns { code: "needs_selection" } when a default can't be resolved
 * so the client can fall back to the manual launcher dialog.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: campaignId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Pack-cap gate (mirrors the other launch paths).
  const usage = await getHyperlocalUsage(user.id);
  if (
    usage.campaignsLimit !== UNLIMITED &&
    usage.campaignsThisMonth >= usage.campaignsLimit
  ) {
    return Response.json(
      {
        error: "Monthly campaign limit reached",
        code: "pack_limit_reached",
        usage: {
          campaignsThisMonth: usage.campaignsThisMonth,
          campaignsLimit: usage.campaignsLimit,
          tier: usage.tier,
          periodEnd: usage.periodEnd,
        },
      },
      { status: 403 },
    );
  }

  const service = createServiceRoleClient();

  // Confirm ownership of the campaign.
  const { data: campaign } = await service
    .from("hl_campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();
  const profileId = meta?.active_profile_id;
  if (!profileId) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  // Resolve defaults. Missing either → tell the client to use the dialog.
  const crmConnectionId = await resolveSphereCrmConnectionId(user.id, profileId);
  const defaultEmail = await getDefaultAppEmailConnection(
    service,
    user.id,
    profileId,
    "hyperlocal",
  );
  if (!crmConnectionId || !defaultEmail) {
    return Response.json(
      { code: "needs_selection" },
      { status: 200 },
    );
  }

  const { data: run, error: runErr } = await service
    .from("hl_runs")
    .insert({
      user_id: user.id,
      campaign_id: campaignId,
      crm_connection_id: crmConnectionId,
      email_connection_id: defaultEmail.connection.id,
      profile_id: profileId,
      phase: "discover",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (runErr || !run) {
    return Response.json(
      { error: runErr?.message ?? "Could not start run" },
      { status: 500 },
    );
  }

  // Magic mode marker (storage, no schema) so discover auto-fills + proceeds.
  await service.storage
    .from("hyperlocal-uploads")
    .upload(
      `${user.id}/run-mode/${run.id}.json`,
      JSON.stringify({ mode: "magic" }),
      { contentType: "application/json", upsert: true },
    )
    .catch(() => {});

  try {
    await triggerDiscover(run.id);
  } catch (e) {
    await service
      .from("hl_runs")
      .update({
        phase: "failed",
        error: e instanceof Error ? e.message : "Failed to trigger discover",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return Response.json(
      { error: "Failed to start the pipeline." },
      { status: 500 },
    );
  }

  return Response.json({ runId: run.id });
}
