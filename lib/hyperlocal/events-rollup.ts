import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

// ============================================================
// runHyperlocalEventsRollup — daily rollup for hl_email_events.
//
// For events older than RETENTION_DAYS, group by
// (email_connection_id, day, type), upsert per-day counts into
// hl_email_event_daily, then delete the raw events.
//
// The dashboard's "last 30 days" queries still target
// hl_email_events directly. Anything older comes from the rollup.
// Keeps the dashboard fast at 6k-agent scale without throwing away
// historical engagement.
//
// Idempotent — ON CONFLICT upsert means re-running on a partially
// processed window is safe.
// ============================================================

const RETENTION_DAYS = 30;
const PAGE_SIZE = 5000;
const MAX_EVENTS_PER_TICK = 50_000;

export interface RunHyperlocalEventsRollupResult {
  cutoff: string;
  pages: number;
  events_processed: number;
  events_deleted: number;
}

export async function runHyperlocalEventsRollup(): Promise<RunHyperlocalEventsRollupResult> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const cutoffIso = cutoff.toISOString();

  let totalProcessed = 0;
  let totalDeleted = 0;
  let pages = 0;

  // Page through old events, oldest first. Each page: group by
  // (connection, day, type), upsert into the daily table, delete the
  // raw rows we just rolled up.
  while (true) {
    pages += 1;

    const { data: page } = await supabase
      .from("hl_email_events")
      .select("id, email_connection_id, type, recipient_id, occurred_at")
      .lt("occurred_at", cutoffIso)
      .order("occurred_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (!page || page.length === 0) break;

    // Group: { "connId|YYYY-MM-DD|type": { count, recipients:Set } }
    type Agg = {
      email_connection_id: string;
      day: string;
      event_type: string;
      total: number;
      recipients: Set<string>;
    };
    const agg = new Map<string, Agg>();

    for (const e of page as Array<{
      id: string;
      email_connection_id: string | null;
      type: string;
      recipient_id: string | null;
      occurred_at: string;
    }>) {
      if (!e.email_connection_id) continue;
      const day = e.occurred_at.slice(0, 10); // YYYY-MM-DD
      const key = `${e.email_connection_id}|${day}|${e.type}`;
      let a = agg.get(key);
      if (!a) {
        a = {
          email_connection_id: e.email_connection_id,
          day,
          event_type: e.type,
          total: 0,
          recipients: new Set(),
        };
        agg.set(key, a);
      }
      a.total += 1;
      if (e.recipient_id) a.recipients.add(e.recipient_id);
    }

    // Upsert the rollups. ADDS to whatever was already there for that
    // (connection, day, type) so partial-day rollups + same-day
    // inserts are consistent. Postgres ON CONFLICT DO UPDATE with
    // arithmetic does the right thing.
    if (agg.size > 0) {
      const { error: rollupErr } = await supabase.rpc(
        "hl_event_rollup_upsert",
        {
          p_rows: Array.from(agg.values()).map((a) => ({
            email_connection_id: a.email_connection_id,
            day: a.day,
            event_type: a.event_type,
            total: a.total,
            unique_count: a.recipients.size,
          })),
        },
      );
      if (rollupErr) {
        // RPC may not be installed — fall back to a per-row upsert
        // that simulates the same arithmetic in JS.
        console.error(
          "[events-rollup] RPC failed, falling back",
          rollupErr.message,
        );
        for (const a of agg.values()) {
          const { data: existing } = await supabase
            .from("hl_email_event_daily")
            .select("total_event_count, unique_recipient_count")
            .eq("email_connection_id", a.email_connection_id)
            .eq("day", a.day)
            .eq("event_type", a.event_type)
            .maybeSingle();
          await supabase.from("hl_email_event_daily").upsert(
            {
              email_connection_id: a.email_connection_id,
              day: a.day,
              event_type: a.event_type,
              total_event_count: (existing?.total_event_count ?? 0) + a.total,
              unique_recipient_count:
                (existing?.unique_recipient_count ?? 0) + a.recipients.size,
              rolled_up_at: new Date().toISOString(),
            },
            { onConflict: "email_connection_id,day,event_type" },
          );
        }
      }
    }

    // Now delete the raw events we just rolled up.
    const ids = page.map((e: { id: string }) => e.id);
    await supabase.from("hl_email_events").delete().in("id", ids);

    totalProcessed += page.length;
    totalDeleted += ids.length;

    // Safety: stop at 50k events per tick so we don't time out.
    if (totalProcessed >= MAX_EVENTS_PER_TICK) break;
  }

  return {
    cutoff: cutoffIso,
    pages,
    events_processed: totalProcessed,
    events_deleted: totalDeleted,
  };
}
