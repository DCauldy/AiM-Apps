import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  LISTING_STUDIO_BASE,
  UNLIMITED,
  type PackLimit,
} from "@/lib/listing-studio-packs";
import { getListingStudioPacks } from "@/lib/admin-config.server";

// ============================================================
// Listing Studio usage tracking — calendar-month windowing.
//
// Mirrors lib/hyperlocal/usage.ts. Two meters tracked:
//   - active_listings_promoted (primary billing meter)
//   - cma_runs_count (soft cap across all tiers, abuse guardrail)
//
// Pack = active row in ls_user_packs; missing row → user is on the
// Pro base allowance.
// ============================================================

export interface ListingStudioUsageStatus {
  activeListingsPromoted: number;
  activeListingsLimit: PackLimit;
  activeListingsRemaining: number | "unlimited";
  cmaRunsCount: number;
  cmaSoftLimit: PackLimit;
  /** Pack tier (e.g., "Bronze") or "Pro" when no pack active. */
  tier: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  /** Surface a soft warning when ≤1 active listing slot remaining. */
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

/** Resolve a user's current Listing Studio allowances + usage. */
export async function getListingStudioUsage(
  userId: string,
): Promise<ListingStudioUsageStatus> {
  const supabase = createServiceRoleClient();
  const periodStart = getMonthStart();
  const periodEnd = getMonthEnd();

  // 1. Active pack lookup.
  const { data: userPack } = await supabase
    .from("ls_user_packs")
    .select("pack_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  const activePackId =
    userPack && userPack.status !== "canceled" ? userPack.pack_id : null;

  // 2. Resolve pack limits — DB-driven if a pack is active, base otherwise.
  let limits = {
    activeListingsPerMonth: LISTING_STUDIO_BASE.activeListingsPerMonth as PackLimit,
    cmaSoftLimit: LISTING_STUDIO_BASE.cmaSoftLimit as PackLimit,
  };
  let tier = "Pro";

  if (activePackId) {
    const packs = await getListingStudioPacks();
    const pack = packs.find((p) => p.id === activePackId);
    if (pack) {
      limits = {
        activeListingsPerMonth: pack.activeListingsPerMonth,
        cmaSoftLimit: pack.cmaSoftLimit,
      };
      tier = pack.tier;
    }
  }

  // 3. Read meter row for the current month.
  const { data: usage } = await supabase
    .from("ls_usage")
    .select("active_listings_promoted, cma_runs_count")
    .eq("user_id", userId)
    .eq("month_start", periodStart)
    .maybeSingle();

  const promoted = usage?.active_listings_promoted ?? 0;
  const cmaCount = usage?.cma_runs_count ?? 0;
  const limit = limits.activeListingsPerMonth;
  const remaining: number | "unlimited" =
    limit === UNLIMITED ? "unlimited" : Math.max(0, limit - promoted);

  return {
    activeListingsPromoted: promoted,
    activeListingsLimit: limit,
    activeListingsRemaining: remaining,
    cmaRunsCount: cmaCount,
    cmaSoftLimit: limits.cmaSoftLimit,
    tier,
    periodStart,
    periodEnd,
    nudge: remaining !== "unlimited" && remaining <= 1 && promoted > 0,
  };
}

export interface ActiveListingSlotReservation {
  reserved: boolean;
  active_listings_promoted: number;
  active_listings_limit: number;
}

/**
 * Atomic check-and-reserve for "Promote prospect → active listing".
 * Mirrors try_reserve_blog_slot from Blog Engine. Pair with
 * refundActiveListingSlot() on promote-flow failure.
 */
export async function reserveActiveListingSlot(
  userId: string,
): Promise<ActiveListingSlotReservation> {
  const supabase = createServiceRoleClient();
  const monthStart = getMonthStart();

  // Resolve the user's current limit (passed into the RPC so cap logic
  // stays in app code where the pack definitions live).
  const usage = await getListingStudioUsage(userId);
  const limit: number =
    usage.activeListingsLimit === UNLIMITED
      ? UNLIMITED
      : (usage.activeListingsLimit as number);

  const { data, error } = await supabase.rpc("try_reserve_active_listing_slot", {
    p_user_id: userId,
    p_month_start: monthStart,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`reserveActiveListingSlot: ${error.message}`);
  }

  return data as ActiveListingSlotReservation;
}

/**
 * Decrement after a promote-flow failure. Read-modify-write — refunds
 * are infrequent and being off by 1 in a rare double-refund is fine.
 */
export async function refundActiveListingSlot(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const monthStart = getMonthStart();

  const { data: row } = await supabase
    .from("ls_usage")
    .select("active_listings_promoted")
    .eq("user_id", userId)
    .eq("month_start", monthStart)
    .maybeSingle();

  if (!row || (row.active_listings_promoted ?? 0) <= 0) return;

  await supabase
    .from("ls_usage")
    .update({
      active_listings_promoted: row.active_listings_promoted - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("month_start", monthStart);
}

/**
 * Bump the CMA counter (soft cap, no atomic gate). The route handler
 * checks usage.cmaRunsCount >= usage.cmaSoftLimit before kicking off
 * the pipeline — that check is best-effort. RapidAPI cost is the real
 * concern this guards against.
 */
export async function incrementCmaCount(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const monthStart = getMonthStart();
  await supabase.rpc("ls_increment_cma_count", {
    p_user_id: userId,
    p_month_start: monthStart,
  });
}
