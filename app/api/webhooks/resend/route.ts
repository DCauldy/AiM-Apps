import { createServiceRoleClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { decrypt } from "@/lib/hyperlocal/encryption";
import {
  evaluateKillSwitch,
  mapResendEventType,
} from "@/lib/hyperlocal/email/webhook-events";
import { Webhook } from "svix";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// Resend webhook ingester.
//
// Pipeline per call:
//   1. Read raw body (Svix signature is over the bytes, not parsed JSON).
//   2. Parse to extract the email_id so we can find the connection.
//   3. Look up the recipient → connection → connection's webhook secret.
//   4. Verify the Svix signature against that per-connection secret. The
//      attacker model: a forged payload either references a real email_id
//      (signature won't match the connection's secret) or a fake one (we
//      can't find a recipient and ignore as no-op). Either way safe.
//   5. Write the event into hl_email_events (typed enum).
//   6. Apply side-effects: bounce/complaint → suppress + update recipient.
//   7. If the event is bounce/complaint, run the deliverability kill switch.
// ============================================================

interface ResendPayloadShape {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    bounce?: { type?: string; message?: string };
    click?: { link?: string };
  };
}

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();

  // ---- 1. Raw body ----
  const rawBody = await req.text();
  if (!rawBody) {
    return Response.json({ error: "Empty body" }, { status: 400 });
  }

  let payload: ResendPayloadShape;
  try {
    payload = JSON.parse(rawBody) as ResendPayloadShape;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = payload.data?.email_id;
  if (!messageId) {
    return Response.json({ ok: true, ignored: "no email_id" });
  }

  // ---- 2-3. Look up recipient → connection ----
  const { data: recipient } = await supabase
    .from("hl_recipients")
    .select(
      "id, contact_email, email_id, hl_emails!inner(run_id, hl_runs!inner(user_id, email_connection_id))",
    )
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (!recipient) {
    // Unknown message — no signature to check, no harm in ack'ing.
    return Response.json({ ok: true, ignored: "recipient not found" });
  }

  const runInfo = (recipient as unknown as {
    hl_emails: { run_id: string; hl_runs: { user_id: string; email_connection_id: string | null } };
  }).hl_emails;
  const userId = runInfo.hl_runs.user_id;
  const connectionId = runInfo.hl_runs.email_connection_id;

  if (!connectionId) {
    return Response.json({ ok: true, ignored: "no connection id on run" });
  }

  const { data: connection } = await supabase
    .from("hl_email_connections")
    .select("id, resend_webhook_secret_encrypted")
    .eq("id", connectionId)
    .maybeSingle();

  // ---- 4. Verify Svix signature ----
  // We require a per-connection secret in production. If the column is empty
  // (e.g. a user hasn't pasted their Resend signing secret yet), we refuse
  // rather than silently accepting unsigned events — quieter failure modes
  // are worse than a loud one here.
  if (!connection?.resend_webhook_secret_encrypted) {
    return Response.json(
      { error: "Connection has no webhook secret configured" },
      { status: 401 },
    );
  }

  let secret: string;
  try {
    secret = decrypt(connection.resend_webhook_secret_encrypted);
  } catch {
    return Response.json({ error: "Webhook secret decrypt failed" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing Svix headers" }, { status: 401 });
  }

  try {
    const wh = new Webhook(secret);
    wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // ---- 5. Write into hl_email_events ----
  const eventType = mapResendEventType(payload.type);
  if (!eventType) {
    // Unknown event types still get acknowledged so Resend doesn't retry,
    // but we don't insert garbage into our typed enum column.
    return Response.json({ ok: true, ignored: `unmapped type: ${payload.type}` });
  }

  const occurredAt = payload.created_at
    ? new Date(payload.created_at).toISOString()
    : new Date().toISOString();

  const bounceTypeRaw = payload.data?.bounce?.type?.toLowerCase();
  const bounceType =
    bounceTypeRaw === "hard" || bounceTypeRaw === "soft" ? bounceTypeRaw : null;

  const reason =
    payload.data?.bounce?.message ??
    (eventType === "complained" ? "spam complaint" : null);

  await supabase.from("hl_email_events").insert({
    email_connection_id: connectionId,
    recipient_id: recipient.id,
    provider_message_id: messageId,
    type: eventType,
    bounce_type: bounceType,
    reason,
    occurred_at: occurredAt,
    payload: payload as unknown as Record<string, unknown>,
  });

  // ---- 6. Side-effects on the recipient + suppression list ----
  if (eventType === "bounced") {
    await supabase
      .from("hl_recipients")
      .update({
        send_status: "bounced",
        error_message: payload.data?.bounce?.type ?? "bounced",
      })
      .eq("id", recipient.id);
    await addSuppression({
      userId,
      email: recipient.contact_email,
      reason: "bounced",
    });
  } else if (eventType === "complained") {
    await supabase
      .from("hl_recipients")
      .update({
        send_status: "complained",
        error_message: "spam complaint",
      })
      .eq("id", recipient.id);
    await addSuppression({
      userId,
      email: recipient.contact_email,
      reason: "complained",
    });
  } else if (eventType === "unsubscribed") {
    // Resend tracks Gmail/Apple Mail "unsubscribe" gestures here — same
    // treatment as a direct unsubscribe-token submit.
    await addSuppression({
      userId,
      email: recipient.contact_email,
      reason: "unsubscribed",
    });
  } else if (eventType === "opened") {
    await supabase
      .from("hl_recipients")
      .update({ opened_at: occurredAt })
      .eq("id", recipient.id);
  }

  // ---- 7. Kill switch on bounce / complaint ----
  let killSwitch: { paused: boolean; reason?: string } | undefined;
  if (eventType === "bounced" || eventType === "complained") {
    killSwitch = await evaluateKillSwitch(supabase, connectionId);
  }

  return Response.json({ ok: true, type: eventType, kill_switch: killSwitch });
}
