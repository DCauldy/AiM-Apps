import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BofuUsageStatus } from "@/types/blog-engine";

/**
 * Get the Monday of the current week (UTC).
 */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Get the Sunday end of the current week.
 */
export function getWeekEnd(date: Date = new Date()): string {
  const weekStart = new Date(getWeekStart(date));
  weekStart.setUTCDate(weekStart.getUTCDate() + 6);
  return weekStart.toISOString().split("T")[0];
}

/**
 * Get the current Blog Engine usage status for a user.
 */
export async function getBofuUsage(userId: string): Promise<BofuUsageStatus> {
  const supabase = createServiceRoleClient();
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();

  // Get usage record for this week
  const { data: usage } = await supabase
    .from("bofu_usage")
    .select("blogs_generated, blogs_limit, bonus_blogs")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  // Get schedule to determine limit
  const { data: schedule } = await supabase
    .from("bofu_schedules")
    .select("frequency")
    .eq("user_id", userId)
    .maybeSingle();

  const blogsGenerated = usage?.blogs_generated ?? 0;
  const blogsLimit = schedule?.frequency ?? usage?.blogs_limit ?? 3;
  const bonusBlogs = usage?.bonus_blogs ?? 0;
  const blogsRemaining = Math.max(0, blogsLimit - blogsGenerated);
  const effectiveRemaining = blogsRemaining + bonusBlogs;

  return {
    blogsGenerated,
    blogsLimit,
    blogsRemaining,
    bonusBlogs,
    effectiveRemaining,
    weekStart,
    weekEnd,
    nudge: blogsRemaining <= 1 && bonusBlogs === 0 && blogsGenerated > 0,
  };
}

/**
 * Increment blog usage for the current week.
 * Uses monthly quota first, then falls back to bonus blogs.
 */
export async function incrementBofuUsage(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const weekStart = getWeekStart();

  await supabase.rpc("increment_bofu_usage", {
    p_user_id: userId,
    p_week_start: weekStart,
  });
}
