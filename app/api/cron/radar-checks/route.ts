import { createServiceRoleClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/radar-checks
 * Vercel Cron job that triggers scheduled radar checks.
 * Runs every hour, checks for users whose next_check_at is due.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();

    // Find configs where next_check_at <= now and onboarding is completed
    const { data: dueConfigs, error } = await supabase
      .from("radar_config")
      .select("*")
      .eq("onboarding_completed", true)
      .not("next_check_at", "is", null)
      .lte("next_check_at", new Date().toISOString());

    if (error) {
      console.error("[Cron] Failed to query radar configs:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    let triggered = 0;

    for (const config of dueConfigs || []) {
      // Trigger Inngest check
      await inngest.send({
        name: "radar/check.requested",
        data: {
          userId: config.user_id,
          trigger: "scheduled" as const,
        },
      });

      // Calculate next_check_at based on frequency
      const now = new Date();
      let nextCheckAt: Date;

      if (config.monitoring_frequency === "weekly") {
        nextCheckAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        // monthly
        nextCheckAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      await supabase
        .from("radar_config")
        .update({
          next_check_at: nextCheckAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      triggered++;
    }

    console.log(`[Cron] Radar Checks: ${triggered} triggered`);

    return Response.json({
      triggered,
      total: (dueConfigs || []).length,
    });
  } catch (error: unknown) {
    console.error("[Cron] Radar Checks error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
