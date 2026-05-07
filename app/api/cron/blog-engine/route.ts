import { createServiceRoleClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getBofuUsage } from "@/lib/blog-engine/usage";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/blog-engine
 * Vercel Cron job that triggers scheduled blog runs.
 * Runs every hour, checks for users whose next_run_at is due.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();

    // Find schedules where next_run_at <= now and is_active = true
    const { data: dueSchedules, error } = await supabase
      .from("bofu_schedules")
      .select("*")
      .eq("is_active", true)
      .lte("next_run_at", new Date().toISOString());

    if (error) {
      console.error("[Cron] Failed to query schedules:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    let triggered = 0;
    let skipped = 0;

    for (const schedule of dueSchedules || []) {
      // Check usage limits
      const usage = await getBofuUsage(schedule.user_id);
      if (usage.effectiveRemaining <= 0) {
        skipped++;
        continue;
      }

      // Trigger Inngest pipeline
      await inngest.send({
        name: "blog-engine/run.requested",
        data: {
          userId: schedule.user_id,
          triggeredBy: "schedule",
        },
      });

      // Calculate and update next run time
      const nextRunAt = calculateNextRun(
        schedule.active_days,
        schedule.preferred_time,
        schedule.timezone
      );

      await supabase
        .from("bofu_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      triggered++;
    }

    console.log(
      `[Cron] Blog Engine: ${triggered} triggered, ${skipped} skipped (usage limit)`
    );

    return Response.json({
      triggered,
      skipped,
      total: (dueSchedules || []).length,
    });
  } catch (error: unknown) {
    console.error("[Cron] Blog Engine error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Calculate the next scheduled run time after now.
 */
function calculateNextRun(
  activeDays: string[],
  preferredTime: string,
  _timezone: string
): Date {
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const [hours, minutes] = (preferredTime || "08:00").split(":").map(Number);
  const now = new Date();

  // Start from tomorrow to avoid re-triggering today
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);

    const dayName = Object.entries(dayMap).find(
      ([, num]) => num === candidate.getDay()
    )?.[0];

    if (dayName && activeDays.includes(dayName)) {
      candidate.setHours(hours, minutes, 0, 0);
      return candidate;
    }
  }

  // Fallback: tomorrow at preferred time
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}
