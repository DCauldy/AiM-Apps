import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { triggerDiscover } from "@/lib/hyperlocal/run-pipeline";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import { resolveSphereCrmConnectionId } from "@/lib/hyperlocal/sphere";
import { getDefaultAppEmailConnection } from "@/lib/platform/connections";
import type { CampaignLens } from "@/types/hyperlocal";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// When the user picks "quick note" depth we want the no-MLS path: discover
// treats every selected segment as sub-threshold, so it skips awaiting_mls and
// goes straight to generate. A sentinel min_segment_size forces that without a
// schema change. "full report" depth uses the real Reach value.
const QUICK_MIN_SEGMENT_SENTINEL = 1_000_000;

/**
 * POST /api/apps/hyperlocal/sphere/launch
 *
 * The map-first one-shot launcher. Takes the ZIPs the user lit up plus the
 * three dial values, mints a campaign, and kicks off a run through the
 * existing discover→generate→send pipeline.
 *
 * Body:
 *   { zips: string[], lens?: CampaignLens, reach?: number,
 *     depth?: "quick" | "full", mode?: "magic" | "control" }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    zips?: unknown;
    lens?: CampaignLens;
    reach?: number;
    depth?: "quick" | "full";
    propertyType?: string;
    priceMin?: number | null;
    priceMax?: number | null;
    mode?: "magic" | "control";
  };

  const zips = Array.isArray(body.zips)
    ? Array.from(
        new Set(
          body.zips
            .map((z) => String(z).trim().split("-")[0])
            .filter((z) => /^\d{5}$/.test(z)),
        ),
      )
    : [];
  if (zips.length === 0) {
    return Response.json(
      { error: "Select at least one neighborhood." },
      { status: 400 },
    );
  }

  // Audience is ALWAYS everyone in the selected neighborhoods. We bucket with
  // the "balanced" lens (home-address residents OR active searchers) so no one
  // is filtered out, and the generator writes both a seller and a buyer
  // version — each recipient gets the relevant one. The dial's chosen angle
  // (body.lens) is the message emphasis, not an audience filter, so it never
  // shrinks the list to zero.
  const lens: CampaignLens = "balanced";
  const depth = body.depth === "full" ? "full" : "quick";
  const reach =
    typeof body.reach === "number" && body.reach >= 1 && body.reach <= 50
      ? Math.round(body.reach)
      : 3;
  const minSegmentSize =
    depth === "quick" ? QUICK_MIN_SEGMENT_SENTINEL : reach;

  // Data-scope filters: constrain the market analysis (which listings we pull),
  // never the audience. Single property-type choice → a one-entry filter array
  // ("all" or unknown → no filter). Prices clamped to a sane band.
  const VALID_TYPES = ["single_family", "condo", "townhome"];
  const propertyTypeFilters = VALID_TYPES.includes(body.propertyType ?? "")
    ? [body.propertyType as string]
    : [];
  const priceLow =
    typeof body.priceMin === "number" && body.priceMin > 0
      ? Math.round(body.priceMin)
      : null;
  const priceHigh =
    typeof body.priceMax === "number" && body.priceMax > 0
      ? Math.round(body.priceMax)
      : null;

  // Pack-cap gate (mirrors POST /runs — the server-side closure).
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

  // Active profile drives sender/branding resolution + which CRM to pull.
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();
  const profileId = meta?.active_profile_id;
  if (!profileId) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const crmConnectionId = await resolveSphereCrmConnectionId(
    user.id,
    profileId,
  );
  if (!crmConnectionId) {
    return Response.json(
      { error: "Connect a CRM to your profile first.", code: "no_crm" },
      { status: 400 },
    );
  }

  // Resolve the profile's default email connection now so a Magic run can
  // approve+send without a launcher dialog. Null is allowed — the approve
  // step will surface a friendly "connect an email sender" error instead.
  const defaultEmail = await getDefaultAppEmailConnection(
    service,
    user.id,
    profileId,
    "hyperlocal",
  );

  // Mint a campaign from the dial values. Auto-named; the user never sees a
  // campaign form in this flow.
  const name = sphereCampaignName(zips.length, depth);
  const { data: campaign, error: campaignErr } = await service
    .from("hl_campaigns")
    .insert({
      user_id: user.id,
      name,
      segmentation: "zip",
      lens,
      min_segment_size: minSegmentSize,
      service_area_zips: zips,
      property_type_filters: propertyTypeFilters,
      price_range_low: priceLow,
      price_range_high: priceHigh,
      source_filters: [],
      is_active: true,
    })
    .select()
    .single();
  if (campaignErr || !campaign) {
    return Response.json(
      { error: campaignErr?.message ?? "Could not create campaign" },
      { status: 500 },
    );
  }

  const { data: run, error: runErr } = await service
    .from("hl_runs")
    .insert({
      user_id: user.id,
      campaign_id: campaign.id,
      crm_connection_id: crmConnectionId,
      email_connection_id: defaultEmail?.connection.id ?? null,
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

  // Record the chosen mode as a tiny storage marker (no schema change) so the
  // discover task can branch: Magic auto-fills market data and proceeds;
  // Control auto-fills a BASE but still parks at the MLS-upload step so the
  // agent can enrich with their own export.
  const mode = body.mode === "control" ? "control" : "magic";
  await service.storage
    .from("hyperlocal-uploads")
    .upload(
      `${user.id}/run-mode/${run.id}.json`,
      JSON.stringify({ mode }),
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

  return Response.json({ runId: run.id, campaignId: campaign.id });
}

function sphereCampaignName(zipCount: number, depth: "quick" | "full"): string {
  const kind = depth === "full" ? "Market report" : "Neighborly note";
  const where = `${zipCount} neighborhood${zipCount === 1 ? "" : "s"}`;
  return `${kind} · ${where}`;
}
