import { tasks } from "@trigger.dev/sdk/v3";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRadarUsage, incrementAudits } from "@/lib/radar/usage";
import { NextRequest } from "next/server";
import type { radarAuditTask } from "@/triggers/radar";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/audits
 * List audits for the authenticated user, with pages included (latest first).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: audits, error } = await supabase
      .from("radar_audits")
      .select("*, radar_audit_pages(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ audits: audits || [] });
  } catch (error: unknown) {
    console.error("Radar audits GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/radar/audits
 * Trigger a website audit. Validates usage limits.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Validate usage
    const usage = await getRadarUsage(user.id);
    if (usage.auditsUsed >= usage.auditsLimit) {
      return Response.json(
        {
          error: "audit_limit_reached",
          used: usage.auditsUsed,
          limit: usage.auditsLimit,
        },
        { status: 429 }
      );
    }

    // Get website_url from the active platform_profile.
    const serviceClient = createServiceRoleClient();
    const { data: userMeta } = await serviceClient
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .single();
    const { data: profile } = userMeta?.active_profile_id
      ? await serviceClient
          .from("platform_profiles")
          .select("website_url")
          .eq("id", userMeta.active_profile_id)
          .maybeSingle()
      : { data: null };

    if (!profile?.website_url) {
      return Response.json(
        { error: "No website URL configured. Update your profile first." },
        { status: 400 }
      );
    }

    // Increment usage
    await incrementAudits(user.id);

    // Fire the Trigger.dev task. In dev the local Trigger CLI picks
    // up the run; in prod Trigger Cloud runs it. The route returns
    // immediately and the crawl + score happen out-of-band.
    await tasks.trigger<typeof radarAuditTask>("radar-audit", {
      userId: user.id,
      url: profile.website_url,
    });

    return Response.json({
      success: true,
      message: "Audit triggered",
      url: profile.website_url,
    });
  } catch (error: unknown) {
    console.error("Radar audits POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
