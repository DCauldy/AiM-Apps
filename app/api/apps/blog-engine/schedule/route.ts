import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/schedule
 * Get user's schedule.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: schedule } = await supabase
      .from("bofu_schedules")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return Response.json({ schedule });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/blog-engine/schedule
 * Create or update user's schedule.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { frequency, active_days, preferred_time, timezone, is_active } =
      body;

    const serviceClient = createServiceRoleClient();

    // Guard: frequency > 3 requires an active subscription
    if (frequency && frequency > 3) {
      const { data: existingSchedule } = await serviceClient
        .from("bofu_schedules")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingSchedule?.stripe_subscription_id) {
        return Response.json(
          { error: "A subscription is required for frequency above 3. Upgrade in Settings." },
          { status: 403 }
        );
      }
    }

    // Calculate next run time
    const nextRunAt = calculateNextRun(
      active_days || ["monday", "wednesday", "friday"],
      preferred_time || "08:00",
      timezone || "America/New_York"
    );

    const { error } = await serviceClient.from("bofu_schedules").upsert(
      {
        user_id: user.id,
        frequency: frequency || 3,
        active_days: active_days || ["monday", "wednesday", "friday"],
        preferred_time: preferred_time || "08:00",
        timezone: timezone || "America/New_York",
        is_active: is_active !== undefined ? is_active : true,
        next_run_at: nextRunAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Calculate the next scheduled run time.
 */
function calculateNextRun(
  activeDays: string[],
  preferredTime: string,
  timezone: string
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

  const [hours, minutes] = preferredTime.split(":").map(Number);
  const now = new Date();

  // Try each of the next 7 days to find the next active day
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);

    const dayName = Object.entries(dayMap).find(
      ([, num]) => num === candidate.getDay()
    )?.[0];

    if (dayName && activeDays.includes(dayName)) {
      // Set the preferred time
      candidate.setHours(hours, minutes, 0, 0);

      // If it's today but the time has passed, skip to next occurrence
      if (candidate > now) {
        return candidate;
      }
    }
  }

  // Fallback: tomorrow at preferred time
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}
