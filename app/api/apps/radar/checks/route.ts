import { tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import { getRadarUsage, incrementManualChecks } from "@/lib/radar/usage";
import { NextRequest } from "next/server";
import type { radarCheckTask } from "@/triggers/radar";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/checks
 * List radar checks for the authenticated user.
 * ?latest=true — returns the most recent check with its results and alerts.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const latest = searchParams.get("latest") === "true";

    if (latest) {
      // Return the most recent check + associated results and alerts
      const { data: check, error: checkError } = await supabase
        .from("radar_checks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (checkError || !check) {
        return Response.json({ check: null, results: [], alerts: [] });
      }

      // Fetch results and alerts for this check in parallel
      const [resultsRes, alertsRes] = await Promise.all([
        supabase
          .from("radar_results")
          .select("*")
          .eq("check_id", check.id)
          .eq("user_id", user.id),
        supabase
          .from("radar_alerts")
          .select("*")
          .eq("check_id", check.id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      return Response.json({
        check,
        results: resultsRes.data || [],
        alerts: alertsRes.data || [],
      });
    }

    // Default: list recent checks
    const { data: checks, error } = await supabase
      .from("radar_checks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ checks: checks || [] });
  } catch (error: unknown) {
    console.error("Radar checks GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/radar/checks
 * Trigger a manual visibility check.
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
    if (usage.manualChecksUsed >= usage.manualChecksLimit) {
      return Response.json(
        {
          error: "manual_check_limit_reached",
          used: usage.manualChecksUsed,
          limit: usage.manualChecksLimit,
        },
        { status: 429 }
      );
    }

    // Increment usage
    await incrementManualChecks(user.id);

    // Fire the Trigger.dev task. In dev the Trigger.dev CLI receives
    // the run; in prod Trigger Cloud runs it. Either way the route
    // returns immediately and the heavy work happens out-of-band.
    await tasks.trigger<typeof radarCheckTask>("radar-check", {
      userId: user.id,
      trigger: "manual" as const,
    });

    return Response.json({ success: true, message: "Check triggered" });
  } catch (error: unknown) {
    console.error("Radar checks POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
