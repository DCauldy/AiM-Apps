import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Resend → hl_email_events mapping + deliverability kill switch.
//
// Single owner of the event-type translation table so the webhook
// route + any future event ingester (Postmark, SES) stay consistent.
//
// Kill-switch thresholds mirror Resend's published account-suspension
// guidance: bounce rate > 5% or complaint rate > 0.3%. We require a
// minimum sample of recent sends so a fresh connection doesn't pause
// after its first two bounces.
// ============================================================

export const RESEND_EVENT_MAP: Record<string, EmailEventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.unsubscribed": "unsubscribed",
  "email.failed": "failed",
};

export type EmailEventType =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "unsubscribed"
  | "failed";

export function mapResendEventType(raw: string | undefined): EmailEventType | null {
  if (!raw) return null;
  return RESEND_EVENT_MAP[raw] ?? null;
}

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

const KILL_SWITCH_WINDOW_HOURS = 24;
const KILL_SWITCH_MIN_SENDS = 50;
const KILL_SWITCH_BOUNCE_RATE = 0.05;     // Resend recommends < 5%
const KILL_SWITCH_COMPLAINT_RATE = 0.003; // Resend recommends < 0.3%

export interface KillSwitchOutcome {
  paused: boolean;
  reason?: string;
  bounce_rate?: number;
  complaint_rate?: number;
  sample_size?: number;
}

/**
 * Evaluate the last-N-hours event aggregate for one connection and pause it
 * if Resend's deliverability thresholds are exceeded. Idempotent — calling
 * on an already-paused connection is a no-op.
 *
 * Called from the webhook ingester right after writing a bounced/complained
 * event so a problem list is stopped within seconds, not on a cron lag.
 */
export async function evaluateKillSwitch(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<KillSwitchOutcome> {
  // Skip if already paused. Pause state lives on the per-app state row
  // now (each app pauses independently — Mailchimp + Resend on one shared
  // identity could be paused for Hyperlocal but still active for CMA).
  const { data: conn } = await supabase
    .from("app_email_connection_state")
    .select("paused")
    .eq("connection_id", connectionId)
    .eq("app", "hyperlocal")
    .maybeSingle();
  if (!conn || conn.paused) return { paused: false };

  const sinceIso = new Date(
    Date.now() - KILL_SWITCH_WINDOW_HOURS * 3600 * 1000,
  ).toISOString();

  const { data: rows } = await supabase
    .from("hl_email_events")
    .select("type, recipient_id")
    .eq("email_connection_id", connectionId)
    .gte("occurred_at", sinceIso);

  if (!rows || rows.length === 0) return { paused: false };

  const uniq = (t: string) => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.type === t && r.recipient_id) s.add(r.recipient_id);
    }
    return s;
  };

  // "Sample" = unique recipients we have either a sent or delivered event for.
  const sendSet = new Set<string>();
  for (const r of rows) {
    if ((r.type === "sent" || r.type === "delivered") && r.recipient_id) {
      sendSet.add(r.recipient_id);
    }
  }
  const sample = sendSet.size;
  if (sample < KILL_SWITCH_MIN_SENDS) return { paused: false, sample_size: sample };

  const bounceRate = uniq("bounced").size / sample;
  const complaintRate = uniq("complained").size / sample;

  let reason: string | null = null;
  if (bounceRate >= KILL_SWITCH_BOUNCE_RATE) {
    reason = `Bounce rate ${(bounceRate * 100).toFixed(2)}% over ${sample} sends (last ${KILL_SWITCH_WINDOW_HOURS}h) — Resend recommends staying under 5%. Paused to protect sender reputation.`;
  } else if (complaintRate >= KILL_SWITCH_COMPLAINT_RATE) {
    reason = `Spam complaint rate ${(complaintRate * 100).toFixed(2)}% over ${sample} sends (last ${KILL_SWITCH_WINDOW_HOURS}h) — Resend recommends staying under 0.3%. Paused to protect sender reputation.`;
  }

  if (!reason) {
    return {
      paused: false,
      bounce_rate: bounceRate,
      complaint_rate: complaintRate,
      sample_size: sample,
    };
  }

  await supabase
    .from("app_email_connection_state")
    .update({
      paused: true,
      paused_reason: reason,
      paused_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId)
    .eq("app", "hyperlocal");

  return {
    paused: true,
    reason,
    bounce_rate: bounceRate,
    complaint_rate: complaintRate,
    sample_size: sample,
  };
}
