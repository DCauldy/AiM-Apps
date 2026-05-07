import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getRadarUsage, incrementAudits } from "@/lib/radar/usage";
import { runRadarAudit } from "@/lib/radar/run-audit";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV === "development";

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

    // Get website_url from user_profiles
    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from("user_profiles")
      .select("website_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.website_url) {
      return Response.json(
        { error: "No website URL configured. Update your profile first." },
        { status: 400 }
      );
    }

    // Increment usage
    await incrementAudits(user.id);

    if (isDev) {
      // Dev mode: run audit directly in background, return immediately
      runRadarAudit({
        userId: user.id,
        url: profile.website_url,
      }).catch((err) => {
        console.error("[Radar] Audit failed:", err);
      });

      return Response.json({
        success: true,
        message: "Audit triggered (dev mode)",
        url: profile.website_url,
      });
    }

    // Production: send event to Inngest
    await inngest.send({
      name: "radar/audit.requested",
      data: {
        userId: user.id,
        url: profile.website_url,
      },
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
