import { createServiceRoleClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { evaluateKillSwitch } from "@/lib/hyperlocal/email/webhook-events";
import { activecampaignAdapter } from "@/lib/hyperlocal/email/providers/activecampaign";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// ActiveCampaign webhook receiver.
//
// AC doesn't sign payloads — we use the same URL-secret pattern as
// Mailchimp. The secret is attached at provisioning time
// (?secret=xxx) and the adapter's verifyWebhookSignature does a
// timing-safe compare.
//
// Payload format: application/x-www-form-urlencoded with bracket
// notation for nested fields (contact[email], campaign[id], etc.).
// We parse one level of nesting into a structured object so the
// adapter's parseWebhookEvent can consume it.
//
// AC also pings the URL when you add the webhook to validate it
// exists — return 200 on GET so that flow stays happy.
// ============================================================

export async function GET() {
  return new Response("OK", { status: 200 });
}

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();
  const url = new URL(req.url);
  const urlSecret = url.searchParams.get("secret") ?? "";

  const formText = await req.text();
  const payload = parseAcForm(formText);
  if (!payload.type) {
    return Response.json({ ok: true, ignored: "no type" });
  }

  const event = activecampaignAdapter.parseWebhookEvent(payload);
  if (!event) {
    return Response.json({ ok: true, ignored: "unsupported event type" });
  }

  // Resolve the connection via the run that owns the campaign id.
  // AC events not tied to a campaign (rare — unsubscribe outside a
  // campaign context) still come through with provider_message_id = "".
  // We handle them by falling back to the email recipient lookup.
  const campaignId = event.provider_message_id;
  let runConnectionId: string | null = null;
  let runUserId: string | null = null;
  if (campaignId) {
    const { data: run } = await supabase
      .from("hl_runs")
      .select("id, user_id, email_connection_id")
      .eq("provider_campaign_id", campaignId)
      .maybeSingle();
    runConnectionId = run?.email_connection_id ?? null;
    runUserId = run?.user_id ?? null;
  }

  // No campaign match? Try to resolve the connection from the recipient
  // email's most recent run instead — handles list-level events
  // (unsubscribe from the list, not a campaign) where AC sends no
  // campaign id.
  if (!runConnectionId && event.recipient_email) {
    const { data: recipient } = await supabase
      .from("hl_recipients")
      .select(
        "id, hl_emails!inner(run_id, hl_runs!inner(user_id, email_connection_id))",
      )
      .ilike("contact_email", event.recipient_email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    type RecRun = { hl_runs: { user_id: string; email_connection_id: string } };
    type RecEmail = { hl_emails: RecRun };
    const r = recipient as unknown as RecEmail | null;
    runConnectionId = r?.hl_emails?.hl_runs?.email_connection_id ?? null;
    runUserId = r?.hl_emails?.hl_runs?.user_id ?? null;
  }

  if (!runConnectionId || !runUserId) {
    return Response.json({ ok: true, ignored: "no run / connection match" });
  }

  // Verify the URL secret against the connection's stored secret.
  const { data: connection } = await supabase
    .from("hl_email_connections")
    .select("id, resend_webhook_secret_encrypted")
    .eq("id", runConnectionId)
    .maybeSingle();
  if (!connection?.resend_webhook_secret_encrypted) {
    return Response.json(
      { error: "Connection has no webhook secret configured" },
      { status: 401 },
    );
  }
  let storedSecret: string;
  try {
    storedSecret = decrypt(connection.resend_webhook_secret_encrypted);
  } catch {
    return Response.json({ error: "Secret decrypt failed" }, { status: 500 });
  }
  const headers = new Headers(req.headers);
  headers.set("x-ac-secret", urlSecret);
  const ok = activecampaignAdapter.verifyWebhookSignature("", headers, storedSecret);
  if (!ok) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  // Resolve the recipient by (campaign_id, email) when both present.
  let recipientId: string | null = null;
  if (campaignId && event.recipient_email) {
    const { data: recipient } = await supabase
      .from("hl_recipients")
      .select("id, contact_email")
      .eq("provider_message_id", campaignId)
      .ilike("contact_email", event.recipient_email)
      .maybeSingle();
    recipientId = recipient?.id ?? null;

    if (recipient) {
      if (event.type === "unsubscribed") {
        await addSuppression({
          userId: runUserId,
          email: recipient.contact_email,
          reason: "unsubscribed",
        });
      } else if (event.type === "bounced") {
        await supabase
          .from("hl_recipients")
          .update({
            send_status: "bounced",
            error_message: event.bounce_type ?? "bounced",
          })
          .eq("id", recipient.id);
        await addSuppression({
          userId: runUserId,
          email: recipient.contact_email,
          reason: "bounced",
        });
      }
    }
  } else if (event.recipient_email && event.type === "unsubscribed") {
    // Unsubscribe with no campaign id (list-level unsub from AC).
    // Suppress the email globally for this user — they don't want our
    // mail regardless of which campaign they came from.
    await addSuppression({
      userId: runUserId,
      email: event.recipient_email,
      reason: "unsubscribed",
    });
  }

  await supabase.from("hl_email_events").insert({
    email_connection_id: runConnectionId,
    recipient_id: recipientId,
    provider_message_id: campaignId || null,
    type: event.type,
    bounce_type: event.bounce_type ?? null,
    reason: event.reason ?? null,
    occurred_at: event.occurred_at.toISOString(),
    payload: payload as Record<string, unknown>,
  });

  let killSwitch: { paused: boolean; reason?: string } | undefined;
  if (event.type === "bounced" || event.type === "complained") {
    killSwitch = await evaluateKillSwitch(supabase, runConnectionId);
  }

  return Response.json({ ok: true, type: event.type, kill_switch: killSwitch });
}

/**
 * Parse AC's bracket-notation form body into a nested object. AC sends
 * contact[email], campaign[id], list[id], bounce[code] etc. We collect
 * one level of nesting; deeper structures (contact[fields][...]) aren't
 * used by the event types we care about.
 */
function parseAcForm(formText: string): Record<string, unknown> {
  const params = new URLSearchParams(formText);
  const out: Record<string, unknown> = {};
  for (const [k, v] of params.entries()) {
    const m = k.match(/^([a-z_]+)\[([^\]]+)\]$/i);
    if (m) {
      const root = m[1];
      const sub = m[2];
      const obj = (out[root] ?? {}) as Record<string, unknown>;
      obj[sub] = v;
      out[root] = obj;
    } else {
      out[k] = v;
    }
  }
  return out;
}
