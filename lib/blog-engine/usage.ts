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
 *
 * Prefer `reserveBlogSlot()` for new code — it does the check and
 * increment atomically and is race-condition safe. This is kept for
 * legacy call sites and refund accounting.
 */
export async function incrementBofuUsage(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const weekStart = getWeekStart();

  await supabase.rpc("increment_bofu_usage", {
    p_user_id: userId,
    p_week_start: weekStart,
  });
}

export interface BlogSlotReservation {
  reserved: boolean;
  blogs_generated: number;
  blogs_limit: number;
  bonus_blogs: number;
  used_bonus?: boolean;
}

/**
 * Atomically check the user's weekly cap and consume one slot in a single
 * SELECT … FOR UPDATE transaction. Returns `{ reserved: false, … }` when
 * the cap is hit without consuming. Always call this *before* spawning a
 * pipeline; pair with `refundBlogSlot()` on pipeline failure so users
 * don't lose their slot to a transient Claude/Perplexity error.
 */
export async function reserveBlogSlot(
  userId: string,
): Promise<BlogSlotReservation> {
  const supabase = createServiceRoleClient();
  const weekStart = getWeekStart();

  const { data, error } = await supabase.rpc("try_reserve_blog_slot", {
    p_user_id: userId,
    p_week_start: weekStart,
  });

  if (error) {
    // Fail-closed on RPC error — better to reject a real request than to
    // silently over-spend. Caller surfaces this as a 500.
    throw new Error(`reserveBlogSlot: ${error.message}`);
  }

  return data as BlogSlotReservation;
}

/**
 * Decrement the weekly slot count after a pipeline failure. We refund
 * the same bucket we spent from (weekly quota OR bonus pool) — the
 * RPC's `used_bonus` flag from the reservation result tells us which.
 *
 * Read-modify-write is fine here: refunds are infrequent and being off
 * by 1 in the rare double-refund case is preferable to over-engineering.
 */
export async function refundBlogSlot(
  userId: string,
  usedBonus: boolean,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const weekStart = getWeekStart();

  const { data: row } = await supabase
    .from("bofu_usage")
    .select("blogs_generated, bonus_blogs")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (!row) return;

  if (usedBonus) {
    await supabase
      .from("bofu_usage")
      .update({ bonus_blogs: (row.bonus_blogs ?? 0) + 1 })
      .eq("user_id", userId)
      .eq("week_start", weekStart);
    return;
  }

  if ((row.blogs_generated ?? 0) > 0) {
    await supabase
      .from("bofu_usage")
      .update({ blogs_generated: row.blogs_generated - 1 })
      .eq("user_id", userId)
      .eq("week_start", weekStart);
  }
}
