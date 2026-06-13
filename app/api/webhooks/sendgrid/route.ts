import { createServiceRoleClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { evaluateKillSwitch } from "@/lib/hyperlocal/email/webhook-events";
import { sendgridAdapter } from "@/lib/hyperlocal/email/providers/sendgrid";
import { getAppEmailConnectionStateInternal } from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// SendGrid event webhook receiver.
//
// SendGrid posts an ARRAY of events per delivery. We:
//   1. Read raw body (Ed25519 signature is over the bytes)
//   2. Pull the first event's sg_message_id, look up the recipient,
//      derive the connection + its stored signing public key
//   3. Verify the Ed25519 signature for the WHOLE payload
//   4. Iterate events, write each to hl_email_events, fire side-effects
//      (suppression, recipient updates, kill switch)
//
// Differences from the Resend route:
//   - One signature per delivery, many events inside
//   - Different headers (X-Twilio-Email-Event-Webhook-{Signature,Timestamp})
//   - Recipient lookup uses our stripped message id (sg_message_id minus
//     the ".filterdrecv-..." suffix)
// ============================================================

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();
  const rawBody = await req.text();
  if (!rawBody) {
    return Response.json({ error: "Empty body" }, { status: 400 });
  }

  let events: unknown[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (events.length === 0) {
    return Response.json({ ok: true, ignored: "empty batch" });
  }

  // Pull the first event's message id to resolve the connection.
  const firstParsed = sendgridAdapter.parseWebhookEvent(events[0]);
  if (!firstParsed) {
    return Response.json({ ok: true, ignored: "no parseable event" });
  }

  const messageId = firstParsed.provider_message_id;
  const { data: recipientRow } = await supabase
    .from("hl_recipients")
    .select(
      "id, contact_email, email_id, hl_emails!inner(run_id, hl_runs!inner(user_id, email_connection_id))",
    )
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (!recipientRow) {
    return Response.json({ ok: true, ignored: "recipient not found" });
  }

  const runInfo = (recipientRow as unknown as {
    hl_emails: { run_id: string; hl_runs: { user_id: string; email_connection_id: string | null } };
  }).hl_emails;
  const connectionId = runInfo.hl_runs.email_connection_id;
  if (!connectionId) {
    return Response.json({ ok: true, ignored: "no connection id" });
  }

  // Per-app state row carries the encrypted SendGrid event-webhook
  // signing public key under provider_metadata.sendgrid. Each app's
  // webhook URL is distinct so each has its own configured key.
  const appState = await getAppEmailConnectionStateInternal(
    supabase,
    "hyperlocal",
    connectionId,
  );
  const meta = (appState?.provider_metadata ?? {}) as HlEmailAppMetadata;
  const encryptedPublicKey = meta.sendgrid?.webhook_signing_public_key ?? null;
  if (!encryptedPublicKey) {
    // For SendGrid we verify with the agent's signing PUBLIC key, which
    // they paste during verify-domain. Refuse rather than accept unsigned.
    return Response.json(
      { error: "Connection has no webhook public key configured" },
      { status: 401 },
    );
  }

  let publicKey: string;
  try {
    publicKey = decrypt(encryptedPublicKey);
  } catch {
    return Response.json({ error: "Public key decrypt failed" }, { status: 500 });
  }

  const ok = sendgridAdapter.verifyWebhookSignature(rawBody, req.headers, publicKey);
  if (!ok) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // ---- Iterate events, write to hl_email_events + side-effects ----
  let inserted = 0;
  let bouncedOrComplained = false;
  for (const raw of events) {
    const normalized = sendgridAdapter.parseWebhookEvent(raw);
    if (!normalized) continue;

    await supabase.from("hl_email_events").insert({
      email_connection_id: connectionId,
      recipient_id: recipientRow.id,
      provider_message_id: normalized.provider_message_id,
      type: normalized.type,
      bounce_type: normalized.bounce_type ?? null,
      reason: normalized.reason ?? null,
      occurred_at: normalized.occurred_at.toISOString(),
      payload: raw as Record<string, unknown>,
    });
    inserted += 1;

    const userId = runInfo.hl_runs.user_id;

    if (normalized.type === "bounced") {
      bouncedOrComplained = true;
      await supabase
        .from("hl_recipients")
        .update({
          send_status: "bounced",
          error_message: normalized.bounce_type ?? "bounced",
        })
        .eq("id", recipientRow.id);
      await addSuppression({
        userId,
        email: recipientRow.contact_email,
        reason: "bounced",
      });
    } else if (normalized.type === "complained") {
      bouncedOrComplained = true;
      await supabase
        .from("hl_recipients")
        .update({
          send_status: "complained",
          error_message: "spam complaint",
        })
        .eq("id", recipientRow.id);
      await addSuppression({
        userId,
        email: recipientRow.contact_email,
        reason: "complained",
      });
    } else if (normalized.type === "unsubscribed") {
      await addSuppression({
        userId,
        email: recipientRow.contact_email,
        reason: "unsubscribed",
      });
    } else if (normalized.type === "opened") {
      await supabase
        .from("hl_recipients")
        .update({ opened_at: normalized.occurred_at.toISOString() })
        .eq("id", recipientRow.id);
    }
  }

  let killSwitch: { paused: boolean; reason?: string } | undefined;
  if (bouncedOrComplained) {
    killSwitch = await evaluateKillSwitch(supabase, connectionId);
  }

  return Response.json({
    ok: true,
    events_received: events.length,
    events_inserted: inserted,
    kill_switch: killSwitch,
  });
}
