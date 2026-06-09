import { createServiceRoleClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { evaluateKillSwitch } from "@/lib/hyperlocal/email/webhook-events";
import { mailchimpAdapter } from "@/lib/hyperlocal/email/providers/mailchimp";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// Mailchimp webhook receiver.
//
// Differences from Resend / SendGrid:
//   - Mailchimp doesn't HMAC payloads — it relies on URL-secret + IP allow
//     list as soft auth. We attach the URL secret at provisioning time
//     (?secret=xxx), pull it here, and compare timing-safely.
//   - Mailchimp also does a GET preflight to validate the URL works. We
//     200 on GET to keep that flow happy.
//   - Payload is form-encoded (application/x-www-form-urlencoded), NOT
//     JSON. Each event in a separate POST.
//   - Recipient lookup uses provider_campaign_id + recipient_email, since
//     Mailchimp identifies by campaign + email rather than per-recipient
//     message ids.
// ============================================================

export async function GET() {
  // Mailchimp pings the URL with GET when you add the webhook to verify it
  // exists. Return 200 to satisfy.
  return new Response("OK", { status: 200 });
}

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();
  const url = new URL(req.url);
  const urlSecret = url.searchParams.get("secret") ?? "";

  // Mailchimp sends application/x-www-form-urlencoded with bracket notation:
  //   type=campaign&fired_at=2026-06-08%2012%3A00%3A00&data%5Bid%5D=abc...
  // Parse into a structured payload that mirrors what parseWebhookEvent expects.
  const formText = await req.text();
  const payload = parseMailchimpForm(formText);
  if (!payload.type) {
    return Response.json({ ok: true, ignored: "no type" });
  }

  // Resolve the connection from the campaign id baked into the payload.
  const eventForLookup = mailchimpAdapter.parseWebhookEvent(payload);
  if (!eventForLookup) {
    return Response.json({ ok: true, ignored: "unsupported event type" });
  }
  const campaignId = eventForLookup.provider_message_id;

  // Find the run for this campaign — the run's email_connection_id is what
  // we use to load the connection's webhook secret.
  const { data: run } = await supabase
    .from("hl_runs")
    .select("id, user_id, email_connection_id")
    .eq("provider_campaign_id", campaignId)
    .maybeSingle();
  if (!run?.email_connection_id) {
    return Response.json({ ok: true, ignored: "run not found for campaign id" });
  }

  const { data: connection } = await supabase
    .from("hl_email_connections")
    .select("id, resend_webhook_secret_encrypted")
    .eq("id", run.email_connection_id)
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

  // Forge a Headers object with the URL secret so the adapter's verify
  // method can do its timing-safe compare against the stored secret.
  const headers = new Headers(req.headers);
  headers.set("x-mc-secret", urlSecret);
  const ok = mailchimpAdapter.verifyWebhookSignature("", headers, storedSecret);
  if (!ok) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  // Resolve the recipient by (campaign_id, email). Mailchimp campaign events
  // don't have an email (just the campaign id); only unsubscribe/cleaned do.
  let recipientId: string | null = null;
  if (eventForLookup.recipient_email) {
    const { data: recipient } = await supabase
      .from("hl_recipients")
      .select(
        "id, contact_email, hl_emails!inner(run_id, hl_runs!inner(user_id))",
      )
      .eq("provider_message_id", campaignId)
      .ilike("contact_email", eventForLookup.recipient_email)
      .maybeSingle();
    recipientId = recipient?.id ?? null;

    if (recipient) {
      if (eventForLookup.type === "unsubscribed") {
        await addSuppression({
          userId: run.user_id,
          email: recipient.contact_email,
          reason: "unsubscribed",
        });
      } else if (eventForLookup.type === "complained") {
        await supabase
          .from("hl_recipients")
          .update({ send_status: "complained", error_message: "spam complaint" })
          .eq("id", recipient.id);
        await addSuppression({
          userId: run.user_id,
          email: recipient.contact_email,
          reason: "complained",
        });
      } else if (eventForLookup.type === "bounced") {
        await supabase
          .from("hl_recipients")
          .update({
            send_status: "bounced",
            error_message: eventForLookup.bounce_type ?? "bounced",
          })
          .eq("id", recipient.id);
        await addSuppression({
          userId: run.user_id,
          email: recipient.contact_email,
          reason: "bounced",
        });
      }
    }
  }

  await supabase.from("hl_email_events").insert({
    email_connection_id: run.email_connection_id,
    recipient_id: recipientId,
    provider_message_id: campaignId,
    type: eventForLookup.type,
    bounce_type: eventForLookup.bounce_type ?? null,
    reason: eventForLookup.reason ?? null,
    occurred_at: eventForLookup.occurred_at.toISOString(),
    payload: payload as Record<string, unknown>,
  });

  let killSwitch: { paused: boolean; reason?: string } | undefined;
  if (eventForLookup.type === "bounced" || eventForLookup.type === "complained") {
    killSwitch = await evaluateKillSwitch(supabase, run.email_connection_id);
  }

  return Response.json({ ok: true, type: eventForLookup.type, kill_switch: killSwitch });
}

/**
 * Parse Mailchimp's bracket-notation form body into a nested object that
 * looks structurally like the JSON payload our adapter's parseWebhookEvent
 * expects. Handles one level of nesting (data[id], data[email], etc.) —
 * deeper nesting isn't used by the event types we care about.
 */
function parseMailchimpForm(formText: string): Record<string, unknown> {
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
