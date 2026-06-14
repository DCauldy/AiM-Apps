import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  HYPERLOCAL_BASE,
  UNLIMITED,
  type PackLimit,
} from "@/lib/hyperlocal-packs";
import { getHyperlocalPacks } from "@/lib/admin-config.server";

// ============================================================
// Hyperlocal usage tracking — billing-month windowing.
//
// Mirrors the shape of lib/blog-engine/usage.ts but tracks
// campaigns/month instead of blogs/week. Pack = active row in
// hl_user_packs; missing row → user is on the Pro base allowance.
// ============================================================

export interface HyperlocalUsageStatus {
  campaignsThisMonth: number;
  campaignsLimit: PackLimit;
  campaignsRemaining: number | "unlimited";
  segmentsPerCampaign: PackLimit;
  mlsHistoryMonths: PackLimit;
  aiChatEditsPerDraft: PackLimit;
  /** Pack tier (e.g., "Bronze") or "Pro" when no pack active. */
  tier: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  /** Surface a soft warning when ≤1 campaign remaining. */
  nudge: boolean;
}

/** First day of the current calendar month (UTC), YYYY-MM-DD. */
export function getMonthStart(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().split("T")[0];
}

/** Last day of the current calendar month (UTC), YYYY-MM-DD. */
export function getMonthEnd(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );
  return d.toISOString().split("T")[0];
}

/** Resolve a user's current Hyperlocal allowances + usage. */
export async function getHyperlocalUsage(
  userId: string,
): Promise<HyperlocalUsageStatus> {
  const supabase = createServiceRoleClient();
  const periodStart = getMonthStart();
  const periodEnd = getMonthEnd();

  // 1. Look up the user's active pack (if any).
  const { data: userPack } = await supabase
    .from("hl_user_packs")
    .select("pack_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  const activePackId =
    userPack && userPack.status !== "canceled" ? userPack.pack_id : null;

  // 2. Resolve pack limits — DB-driven if a pack is active, base
  //    allowances otherwise. Hits the same admin-config helper the
  //    admin UI uses, so DB edits propagate everywhere consistently.
  let limits = {
    campaignsPerMonth: HYPERLOCAL_BASE.campaignsPerMonth as PackLimit,
    segmentsPerCampaign: HYPERLOCAL_BASE.segmentsPerCampaign as PackLimit,
    mlsHistoryMonths: HYPERLOCAL_BASE.mlsHistoryMonths as PackLimit,
    aiChatEditsPerDraft: HYPERLOCAL_BASE.aiChatEditsPerDraft as PackLimit,
  };
  let tier = "Pro";

  if (activePackId) {
    const packs = await getHyperlocalPacks();
    const pack = packs.find((p) => p.id === activePackId);
    if (pack) {
      limits = {
        campaignsPerMonth: pack.campaignsPerMonth,
        segmentsPerCampaign: pack.segmentsPerCampaign,
        mlsHistoryMonths: pack.mlsHistoryMonths,
        aiChatEditsPerDraft: pack.aiChatEditsPerDraft,
      };
      tier = pack.tier;
    }
  }

  // 3. Count campaigns started this month. We count `hl_runs`
  //    (started_at within the period) rather than `hl_campaigns`
  //    because a campaign template can be re-run; the meter is
  //    per-run cost, not per-template.
  const { count: campaignsThisMonth } = await supabase
    .from("hl_runs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", periodStart + "T00:00:00Z")
    .lte("started_at", periodEnd + "T23:59:59Z");

  const used = campaignsThisMonth ?? 0;
  const limit = limits.campaignsPerMonth;
  const remaining: number | "unlimited" =
    limit === UNLIMITED ? "unlimited" : Math.max(0, limit - used);

  return {
    campaignsThisMonth: used,
    campaignsLimit: limit,
    campaignsRemaining: remaining,
    segmentsPerCampaign: limits.segmentsPerCampaign,
    mlsHistoryMonths: limits.mlsHistoryMonths,
    aiChatEditsPerDraft: limits.aiChatEditsPerDraft,
    tier,
    periodStart,
    periodEnd,
    nudge:
      remaining !== "unlimited" && remaining <= 1 && used > 0,
  };
}
