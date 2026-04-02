import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Computes the start of the current billing period based on the user's signup date.
 * Periods roll monthly on the same day the user signed up (anniversary billing).
 *
 * Example: signed up March 22 → current period starts March 22, resets April 22.
 * Edge case: signed up Jan 31, Feb period clamps to Feb 28/29.
 */
function getPeriodStart(createdAt: Date, now: Date = new Date()): Date {
  const signupDay = createdAt.getUTCDate();

  const year  = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDayThisMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = new Date(Date.UTC(year, month, Math.min(signupDay, lastDayThisMonth)));

  if (start > now) {
    const prevMonth = month - 1;
    const lastDayPrevMonth = new Date(Date.UTC(year, prevMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, prevMonth, Math.min(signupDay, lastDayPrevMonth)));
  }

  return start;
}

/** Returns the current billing period key as 'YYYY-MM-DD'. */
export function getCurrentPeriod(createdAt: Date, now: Date = new Date()): string {
  return getPeriodStart(createdAt, now).toISOString().slice(0, 10);
}

/** Returns the ISO timestamp when the next billing period starts. */
export function getResetDate(createdAt: Date, now: Date = new Date()): string {
  const periodStart = getPeriodStart(createdAt, now);
  const signupDay   = createdAt.getUTCDate();
  const nextMonth   = periodStart.getUTCMonth() + 1;
  const nextYear    = periodStart.getUTCFullYear();
  const lastDayNext = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextYear, nextMonth, Math.min(signupDay, lastDayNext))).toISOString();
}

export type TrialStatus = {
  usage: number;
  limit: number;
  remaining: number;
  resetDate: string;
};

/** Fetch usage for a user against their plan-based monthly_limit (server-side only). */
export async function getTrialStatus(userId: string): Promise<TrialStatus> {
  const serviceClient = createServiceRoleClient();

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("monthly_limit, created_at")
    .eq("id", userId)
    .single();

  const limit     = (profile?.monthly_limit as number | null) ?? 10;
  const createdAt = new Date(profile?.created_at ?? new Date());
  const period    = getCurrentPeriod(createdAt);

  const { data: usageRow } = await serviceClient
    .from("prompt_studio_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  const usage = (usageRow?.count as number | null) ?? 0;

  return {
    usage,
    limit,
    remaining: Math.max(0, limit - usage),
    resetDate: getResetDate(createdAt),
  };
}

/** Atomically increment usage by 1. */
export async function incrementUsage(userId: string): Promise<void> {
  const serviceClient = createServiceRoleClient();

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .single();

  const createdAt = new Date(profile?.created_at ?? new Date());
  const period    = getCurrentPeriod(createdAt);

  await serviceClient.rpc("increment_trial_usage", {
    p_user_id: userId,
    p_period:  period,
  });
}

/** @deprecated Use incrementUsage instead */
export const incrementTrialUsage = incrementUsage;
