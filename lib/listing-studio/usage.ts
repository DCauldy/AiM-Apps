import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  LISTING_STUDIO_BASE,
  UNLIMITED,
  type PackLimit,
} from "@/lib/listing-studio-packs";
import { getListingStudioPacks } from "@/lib/admin-config.server";

// ============================================================
// CMA usage tracking — snapshot meter (enrolled clients) plus a
// monthly counter for deliveries actually sent.
//
// Snapshot meter:
//   active_clients = COUNT(cma_clients WHERE enrolled = TRUE)
//   Enrolling consumes a slot via try_reserve_client_slot RPC.
//   Unenrolling immediately frees it. No monthly windowing — the cap
//   bounds the live set.
//
// Monthly counter (informational, surfaced on dashboard):
//   deliveries_sent — how many CMAs went out this month
//   manual_sends    — how many of those were force-sent (vs cadence)
// ============================================================

export interface ListingStudioUsageStatus {
  activeClients: number;
  activeClientsLimit: PackLimit;
  activeClientsRemaining: number | "unlimited";
  deliveriesSent: number;
  manualSends: number;
  manualSendsLimit: PackLimit;
  /** Pack tier (e.g., "Bronze") or "Pro" when no pack active. */
  tier: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  /** Surface a soft warning when ≤5 client slots remaining. */
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

/** Resolve a user's current CMA allowances + usage. */
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
    activeClientsLimit: LISTING_STUDIO_BASE.activeClientsLimit as PackLimit,
    manualSendsPerMonth:
      LISTING_STUDIO_BASE.manualSendsPerMonth as PackLimit,
  };
  let tier = "Pro";

  if (activePackId) {
    const packs = await getListingStudioPacks();
    const pack = packs.find((p) => p.id === activePackId);
    if (pack) {
      limits = {
        activeClientsLimit: pack.activeClientsLimit,
        manualSendsPerMonth: pack.manualSendsPerMonth,
      };
      tier = pack.tier;
    }
  }

  // 3. Snapshot meter — live count of enrolled clients.
  const { count: activeCountRaw } = await supabase
    .from("cma_clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("enrolled", true);
  const activeClients = activeCountRaw ?? 0;

  // 4. Monthly counters — derived live from cma_client_deliveries
  //    (joined through cma_clients for the user_id scope). No cached
  //    counter to drift out of sync when clients/deliveries get
  //    deleted during testing or by the agent. Two parallel count
  //    queries; both hit the indexed (client_id, created_at) path.
  const periodStartIso = `${periodStart}T00:00:00.000Z`;
  const [deliveriesSentRes, manualSendsRes] = await Promise.all([
    supabase
      .from("cma_client_deliveries")
      .select("id, cma_clients!inner(user_id)", {
        count: "exact",
        head: true,
      })
      .eq("cma_clients.user_id", userId)
      .gte("created_at", periodStartIso),
    supabase
      .from("cma_client_deliveries")
      .select("id, cma_clients!inner(user_id)", {
        count: "exact",
        head: true,
      })
      .eq("cma_clients.user_id", userId)
      .eq("trigger_source", "manual")
      .gte("created_at", periodStartIso),
  ]);

  const limit = limits.activeClientsLimit;
  const remaining: number | "unlimited" =
    limit === UNLIMITED ? "unlimited" : Math.max(0, limit - activeClients);

  return {
    activeClients,
    activeClientsLimit: limit,
    activeClientsRemaining: remaining,
    deliveriesSent: deliveriesSentRes.count ?? 0,
    manualSends: manualSendsRes.count ?? 0,
    manualSendsLimit: limits.manualSendsPerMonth,
    tier,
    periodStart,
    periodEnd,
    nudge: remaining !== "unlimited" && remaining > 0 && remaining <= 5,
  };
}

export interface ClientSlotReservation {
  reserved: boolean;
  active_clients: number;
  active_clients_limit: number;
  error?: string;
}

/**
 * Atomic check-and-reserve when enrolling a client into the cadence.
 * Pairs with try_reserve_client_slot RPC — that function row-locks the
 * candidate row, recounts live enrolled rows, and only flips
 * enrolled=true when there's room under the cap.
 *
 * Idempotent on re-enrollment of an already-enrolled client.
 */
export async function reserveClientSlot(
  userId: string,
  clientId: string,
): Promise<ClientSlotReservation> {
  const supabase = createServiceRoleClient();

  const usage = await getListingStudioUsage(userId);
  const limit: number =
    usage.activeClientsLimit === UNLIMITED
      ? UNLIMITED
      : (usage.activeClientsLimit as number);

  const { data, error } = await supabase.rpc("try_reserve_client_slot", {
    p_user_id: userId,
    p_client_id: clientId,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`reserveClientSlot: ${error.message}`);
  }

  return data as ClientSlotReservation;
}

/**
 * Unenroll a client. Frees the snapshot slot immediately; cadence
 * scheduler stops firing for the row on the next tick.
 */
export async function releaseClientSlot(
  userId: string,
  clientId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("cma_clients")
    .update({ enrolled: false, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("user_id", userId);
}

