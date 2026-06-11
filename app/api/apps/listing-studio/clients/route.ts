import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import type {
  CmaClientFilter,
  CmaClientSummary,
  CmaClientsListResponse,
} from "@/types/cma";

export const dynamic = "force-dynamic";

const LIST_PAGE_SIZE = 200;

const SUMMARY_FIELDS = `
  id, first_name, last_name, email, address,
  enrolled, paused, unsubscribed_at,
  cadence_days, next_due_at, last_delivered_at, delivered_count
`;

/**
 * Derive the engagement chip from the latest delivery's open/click state.
 * Wave 5 will populate opened_at/clicked_at via ESP webhooks; for now
 * everyone is "cold" or "none" depending on whether they've ever
 * received a CMA.
 */
function deriveEngagement(
  delivery: {
    clicked_at: string | null;
    opened_at: string | null;
    delivered_at: string | null;
  } | null,
): CmaClientSummary["engagement"] {
  if (!delivery) return "none";
  if (delivery.clicked_at) return "clicked";
  if (delivery.opened_at) return "opened";
  if (delivery.delivered_at) return "delivered";
  return "cold";
}

/**
 * GET /api/apps/listing-studio/clients
 *
 * Query params:
 *   filter — all | pending | enrolled | paused | unsubscribed (default: all)
 *   q      — case-insensitive substring match on name/address
 *
 * Returns the full list (no pagination) for Wave 3 — past-client
 * lists rarely exceed 1k, and the agent's review screen wants to see
 * everything at once. Pagination can land as a Wave 6 polish.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as CmaClientFilter;
  const q = searchParams.get("q")?.trim() ?? "";

  const profile = await getActiveProfile(user.id);
  const service = createServiceRoleClient();

  // 1. Count per filter — surfaced as the badge on each filter tab.
  //    All four counts in parallel; service role so RLS doesn't double up.
  const baseFilter = (table: ReturnType<typeof service.from>) => {
    let q = table.select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (profile) q = q.eq("profile_id", profile.id);
    return q;
  };

  const [allCount, pendingCount, enrolledCount, pausedCount, unsubCount] =
    await Promise.all([
      baseFilter(service.from("cma_clients")),
      baseFilter(service.from("cma_clients"))
        .eq("enrolled", false)
        .eq("paused", false)
        .is("unsubscribed_at", null),
      baseFilter(service.from("cma_clients"))
        .eq("enrolled", true)
        .eq("paused", false)
        .is("unsubscribed_at", null),
      baseFilter(service.from("cma_clients")).eq("paused", true),
      baseFilter(service.from("cma_clients")).not("unsubscribed_at", "is", null),
    ]);

  const counts: Record<CmaClientFilter, number> = {
    all: allCount.count ?? 0,
    pending: pendingCount.count ?? 0,
    enrolled: enrolledCount.count ?? 0,
    paused: pausedCount.count ?? 0,
    unsubscribed: unsubCount.count ?? 0,
  };

  // 2. Fetch the filtered list.
  let query = service
    .from("cma_clients")
    .select(SUMMARY_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIST_PAGE_SIZE);
  if (profile) query = query.eq("profile_id", profile.id);

  switch (filter) {
    case "pending":
      query = query
        .eq("enrolled", false)
        .eq("paused", false)
        .is("unsubscribed_at", null);
      break;
    case "enrolled":
      query = query
        .eq("enrolled", true)
        .eq("paused", false)
        .is("unsubscribed_at", null);
      break;
    case "paused":
      query = query.eq("paused", true);
      break;
    case "unsubscribed":
      query = query.not("unsubscribed_at", "is", null);
      break;
    // "all" — no extra filter
  }

  if (q.length > 0) {
    // Substring match across name OR address. Supabase's `or` filter
    // wants a single OR clause string.
    const esc = q.replace(/[%_]/g, "\\$&");
    query = query.or(
      `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%,address.ilike.%${esc}%`,
    );
  }

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 3. Engagement lookup — single query for the most-recent delivery
  //    per surfaced client. Skipped when the list is empty.
  const ids = (rows ?? []).map((r) => r.id);
  const latestDeliveryByClient = new Map<
    string,
    {
      clicked_at: string | null;
      opened_at: string | null;
      delivered_at: string | null;
    }
  >();

  if (ids.length > 0) {
    const { data: deliveries } = await service
      .from("cma_client_deliveries")
      .select("client_id, clicked_at, opened_at, delivered_at, created_at")
      .in("client_id", ids)
      .order("created_at", { ascending: false });

    for (const d of deliveries ?? []) {
      if (latestDeliveryByClient.has(d.client_id)) continue;
      latestDeliveryByClient.set(d.client_id, {
        clicked_at: d.clicked_at,
        opened_at: d.opened_at,
        delivered_at: d.delivered_at,
      });
    }
  }

  const clients: CmaClientSummary[] = (rows ?? []).map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    address: r.address,
    enrolled: r.enrolled,
    paused: r.paused,
    unsubscribed_at: r.unsubscribed_at,
    cadence_days: r.cadence_days,
    next_due_at: r.next_due_at,
    last_delivered_at: r.last_delivered_at,
    delivered_count: r.delivered_count,
    engagement: deriveEngagement(latestDeliveryByClient.get(r.id) ?? null),
  }));

  const response: CmaClientsListResponse = { clients, counts };
  return Response.json(response);
}

/**
 * POST /api/apps/listing-studio/clients
 *
 * Create a manual client (no CRM connection). Used for one-off past
 * clients the agent's CRM didn't capture (e.g. clients from before
 * the agent started using FUB).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { first_name, last_name, email, phone, address } = (body ?? {}) as {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };

  if (!address?.trim()) {
    return Response.json(
      { error: "address is required — the CMA pipeline needs a property" },
      { status: 400 },
    );
  }
  if (!email?.trim()) {
    return Response.json(
      { error: "email is required — the CMA delivery needs a recipient" },
      { status: 400 },
    );
  }

  const profile = await getActiveProfile(user.id);
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("cma_clients")
    .insert({
      user_id: user.id,
      profile_id: profile?.id ?? null,
      source: "manual",
      first_name: first_name?.trim() || null,
      last_name: last_name?.trim() || null,
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      address: address.trim(),
      address_normalized: address.trim().toLowerCase().replace(/\s+/g, " "),
      property_facts: {},
      enrolled: false,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ client: data });
}
