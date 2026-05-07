import { createServiceRoleClient } from "@/lib/supabase/server";
import type { RadarUsageStatus } from "@/types/radar";

/**
 * Get the "YYYY-MM" period string for the current month (UTC).
 */
export function getMonthStart(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Get the current Radar usage status for a user.
 */
export async function getRadarUsage(
  userId: string
): Promise<RadarUsageStatus> {
  const supabase = createServiceRoleClient();
  const period = getMonthStart();

  // Get usage record for this month
  const { data: usage } = await supabase
    .from("radar_usage")
    .select("manual_checks_used, audits_used")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  // Get config for limits
  const { data: config } = await supabase
    .from("radar_config")
    .select("query_limit, manual_checks_limit, audits_limit")
    .eq("user_id", userId)
    .maybeSingle();

  // Count active queries for this user
  const { count: queriesUsed } = await supabase
    .from("radar_queries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  const queryLimit = config?.query_limit ?? 25;
  const manualChecksLimit = config?.manual_checks_limit ?? 2;
  const auditsLimit = config?.audits_limit ?? 1;

  return {
    queriesUsed: queriesUsed ?? 0,
    queryLimit,
    manualChecksUsed: usage?.manual_checks_used ?? 0,
    manualChecksLimit,
    auditsUsed: usage?.audits_used ?? 0,
    auditsLimit,
    period,
  };
}

/**
 * Increment the manual checks counter for the current month.
 */
export async function incrementManualChecks(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const period = getMonthStart();

  await supabase.rpc("increment_radar_manual_checks", {
    p_user_id: userId,
    p_period: period,
  });
}

/**
 * Increment the audits counter for the current month.
 */
export async function incrementAudits(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const period = getMonthStart();

  await supabase.rpc("increment_radar_audits", {
    p_user_id: userId,
    p_period: period,
  });
}
