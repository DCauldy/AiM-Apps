import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getListingStudioUsage } from "@/lib/listing-studio/usage";
import { getActiveProfile } from "@/lib/profiles/server";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import type {
  CmaDashboardResponse,
  CmaEngagementRates,
  CmaRecentDelivery,
  CmaUpcomingDelivery,
} from "@/types/cma";

export const dynamic = "force-dynamic";

const UPCOMING_LIMIT = 25;
const RECENT_LIMIT = 10;
const ROLLING_WINDOW_DAYS = 30;
const DEFAULT_REMINDER_LEAD_DAYS = 7;
const DEFAULT_CADENCE_DAYS = 90;

/**
 * GET /api/apps/listing-studio/dashboard
 *
 * Single round trip for the dashboard surface. Everything is read in
 * parallel and projected on the server so the client just renders.
 *
 * Engagement rates are computed by counting non-null timestamps —
 * dimensional rollups are intentionally avoided. cma_client_deliveries
 * is one row per delivery cycle per client and the SELECT count is
 * sub-50ms even at 10k+ rows.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const profile = await getActiveProfile(user.id);
  const profileScope = profile?.id ?? null;

  const [usage, agentSettings] = await Promise.all([
    getListingStudioUsage(user.id),
    fetchAgentSettings(service, user.id),
  ]);

  const now = new Date();
  const reminderWindow = new Date(now);
  reminderWindow.setUTCDate(
    reminderWindow.getUTCDate() + agentSettings.reminder_lead_days,
  );
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - ROLLING_WINDOW_DAYS);
  const monthStartIso = monthStart(now);

  // Parallel reads — each independent.
  const [
    pendingCountRes,
    dueCountRes,
    upcomingRes,
    recent,
    monthDeliveries,
    thirtyDayDeliveries,
  ] = await Promise.all([
    countQuery(
      service,
      user.id,
      profileScope,
      (q) =>
        q
          .eq("enrolled", false)
          .eq("paused", false)
          .is("unsubscribed_at", null),
    ),
    countQuery(
      service,
      user.id,
      profileScope,
      (q) =>
        q
          .eq("enrolled", true)
          .eq("paused", false)
          .is("unsubscribed_at", null)
          .lte("next_due_at", reminderWindow.toISOString()),
    ),
    fetchUpcoming(service, user.id, profileScope),
    fetchRecentDeliveries(service, user.id, profileScope),
    fetchDeliveriesForRates(
      service,
      user.id,
      profileScope,
      monthStartIso + "T00:00:00.000Z",
    ),
    fetchDeliveriesForRates(
      service,
      user.id,
      profileScope,
      thirtyDaysAgo.toISOString(),
    ),
  ]);

  const response: CmaDashboardResponse = {
    active_clients: usage.activeClients,
    active_clients_limit:
      usage.activeClientsLimit === UNLIMITED
        ? "unlimited"
        : (usage.activeClientsLimit as number),
    pending_review: pendingCountRes,
    due_within_reminder_window: dueCountRes,
    reminder_lead_days: agentSettings.reminder_lead_days,
    manual_review_required: agentSettings.manual_review_required,
    default_cadence_days: agentSettings.default_cadence_days,
    tier: usage.tier,
    deliveries_this_month: usage.deliveriesSent,
    manual_sends_this_month: usage.manualSends,
    manual_sends_limit:
      usage.manualSendsLimit === UNLIMITED
        ? "unlimited"
        : (usage.manualSendsLimit as number),
    upcoming: upcomingRes,
    recent,
    rates_this_month: aggregateRates(monthDeliveries),
    rates_last_30_days: aggregateRates(thirtyDayDeliveries),
  };

  return Response.json(response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DeliveryAgg {
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  send_error: string | null;
  created_at: string;
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type ClientCountQuery = ReturnType<
  ReturnType<ServiceClient["from"]>["select"]
>;

async function fetchAgentSettings(
  service: ServiceClient,
  userId: string,
): Promise<{
  default_cadence_days: number;
  reminder_lead_days: number;
  manual_review_required: boolean;
}> {
  const { data } = await service
    .from("cma_agent_settings")
    .select("default_cadence_days, reminder_lead_days, manual_review_required")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    default_cadence_days:
      data?.default_cadence_days ?? DEFAULT_CADENCE_DAYS,
    reminder_lead_days:
      data?.reminder_lead_days ?? DEFAULT_REMINDER_LEAD_DAYS,
    manual_review_required: data?.manual_review_required ?? false,
  };
}

async function countQuery(
  service: ServiceClient,
  userId: string,
  profileScope: string | null,
  refine: (q: ClientCountQuery) => ClientCountQuery,
): Promise<number> {
  let base = service
    .from("cma_clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (profileScope) base = base.eq("profile_id", profileScope);
  const { count } = await refine(base as ClientCountQuery);
  return count ?? 0;
}

async function fetchUpcoming(
  service: ServiceClient,
  userId: string,
  profileScope: string | null,
): Promise<CmaUpcomingDelivery[]> {
  let q = service
    .from("cma_clients")
    .select(
      "id, first_name, last_name, address, next_due_at, cadence_days",
    )
    .eq("user_id", userId)
    .eq("enrolled", true)
    .eq("paused", false)
    .is("unsubscribed_at", null)
    .not("next_due_at", "is", null)
    .order("next_due_at", { ascending: true })
    .limit(UPCOMING_LIMIT);
  if (profileScope) q = q.eq("profile_id", profileScope);
  const { data } = await q;
  return ((data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    address: string | null;
    next_due_at: string;
    cadence_days: number | null;
  }>).map((r) => ({
    client_id: r.id,
    client_name: composeName(r.first_name, r.last_name),
    address: r.address,
    next_due_at: r.next_due_at,
    cadence_days: r.cadence_days,
  }));
}

async function fetchRecentDeliveries(
  service: ServiceClient,
  userId: string,
  profileScope: string | null,
): Promise<CmaRecentDelivery[]> {
  // Join through cma_clients so the deliveries query is scoped by
  // user_id + active profile. PostgREST nested select pulls the client
  // cols in one round trip.
  let q = service
    .from("cma_client_deliveries")
    .select(
      `id, client_id, delivered_at, send_error, recommended_price_cents,
       opened_at, clicked_at, bounced_at, complained_at, created_at,
       cma_clients!inner(first_name, last_name, address, profile_id, user_id)`,
    )
    .eq("cma_clients.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (profileScope) {
    q = q.eq("cma_clients.profile_id", profileScope);
  }
  const { data } = await q;
  // PostgREST types the embedded join as Array<...> even when an
  // !inner FK guarantees exactly one match. Cast through unknown and
  // normalize so downstream callers don't care which shape we got.
  type EmbeddedClient = {
    first_name: string | null;
    last_name: string | null;
    address: string | null;
  };
  type RecentRaw = {
    id: string;
    client_id: string;
    delivered_at: string | null;
    send_error: string | null;
    recommended_price_cents: number | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
    complained_at: string | null;
    cma_clients: EmbeddedClient | EmbeddedClient[];
  };
  return ((data ?? []) as unknown as RecentRaw[]).map((row) => {
    const client = Array.isArray(row.cma_clients)
      ? row.cma_clients[0]
      : row.cma_clients;
    return {
      delivery_id: row.id,
      client_id: row.client_id,
      client_name: composeName(
        client?.first_name ?? null,
        client?.last_name ?? null,
      ),
      address: client?.address ?? null,
      delivered_at: row.delivered_at,
      send_error: row.send_error,
      recommended_price_cents: row.recommended_price_cents,
      engagement: deriveRecentEngagement(row),
    };
  });
}

async function fetchDeliveriesForRates(
  service: ServiceClient,
  userId: string,
  profileScope: string | null,
  sinceIso: string,
): Promise<DeliveryAgg[]> {
  let q = service
    .from("cma_client_deliveries")
    .select(
      `delivered_at, opened_at, clicked_at, bounced_at, complained_at,
       send_error, created_at,
       cma_clients!inner(user_id, profile_id)`,
    )
    .eq("cma_clients.user_id", userId)
    .gte("created_at", sinceIso);
  if (profileScope) {
    q = q.eq("cma_clients.profile_id", profileScope);
  }
  const { data } = await q;
  return (data ?? []) as DeliveryAgg[];
}

function aggregateRates(deliveries: DeliveryAgg[]): CmaEngagementRates {
  let sent = 0;
  let delivered = 0;
  let opened = 0;
  let clicked = 0;
  let bounced = 0;
  let complained = 0;
  for (const d of deliveries) {
    sent += 1;
    if (d.delivered_at) delivered += 1;
    if (d.opened_at) opened += 1;
    if (d.clicked_at) clicked += 1;
    if (d.bounced_at) bounced += 1;
    if (d.complained_at) complained += 1;
  }
  return {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    open_rate: delivered > 0 ? opened / delivered : null,
    click_rate: delivered > 0 ? clicked / delivered : null,
    bounce_rate: sent > 0 ? bounced / sent : null,
    complaint_rate: delivered > 0 ? complained / delivered : null,
  };
}

function deriveRecentEngagement(row: {
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}): CmaRecentDelivery["engagement"] {
  if (row.complained_at) return "complained";
  if (row.bounced_at) return "bounced";
  if (row.clicked_at) return "clicked";
  if (row.opened_at) return "opened";
  if (row.delivered_at) return "delivered";
  return "pending";
}

function composeName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

function monthStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().split("T")[0];
}
