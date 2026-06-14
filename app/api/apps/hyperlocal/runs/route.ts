import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { triggerDiscover } from "@/lib/hyperlocal/run-pipeline";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/runs?campaignId=...
 * List runs (most recent first). Optionally filtered by campaign.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");

  let query = supabase
    .from("hl_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ runs: data ?? [] });
}

/**
 * POST /api/apps/hyperlocal/runs
 * Kick off a new run for an existing campaign. Triggers the discover phase.
 *
 * Body:
 *   { campaign_id, crm_connection_id, sender_profile_id?, branding_profile_id?, email_connection_id? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    campaign_id,
    crm_connection_id,
    sender_profile_id,
    branding_profile_id,
    email_connection_id,
  } = body as {
    campaign_id?: string;
    crm_connection_id?: string;
    sender_profile_id?: string;
    branding_profile_id?: string;
    email_connection_id?: string;
  };

  if (!campaign_id || !crm_connection_id) {
    return Response.json(
      { error: "campaign_id and crm_connection_id are required" },
      { status: 400 }
    );
  }

  // Pack-cap gate. Client UIs disable the launch button when usage hits
  // the cap and offer an upgrade — this is the server-side closure so a
  // direct POST can't bypass it. UNLIMITED tiers (Diamond) skip the gate.
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

  // Validate ownership of all referenced rows
  const service = createServiceRoleClient();
  const checks = await Promise.all([
    service
      .from("hl_campaigns")
      .select("id")
      .eq("id", campaign_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("hl_crm_connections")
      .select("id")
      .eq("id", crm_connection_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!checks[0].data) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!checks[1].data) {
    return Response.json({ error: "CRM connection not found" }, { status: 404 });
  }

  // Capture the user's active profile on the run so the pipeline can render
  // sender + branding from platform_profiles instead of legacy snapshots.
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();

  const { data: run, error } = await service
    .from("hl_runs")
    .insert({
      user_id: user.id,
      campaign_id,
      crm_connection_id,
      profile_id: meta?.active_profile_id ?? null,
      sender_profile_id: sender_profile_id ?? null,
      branding_profile_id: branding_profile_id ?? null,
      email_connection_id: email_connection_id ?? null,
      phase: "discover",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

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
      { error: "Failed to trigger pipeline", run },
      { status: 500 }
    );
  }

  return Response.json({ run });
}
