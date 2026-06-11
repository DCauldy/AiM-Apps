import "server-only";

import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { mapResendEventType } from "@/lib/hyperlocal/email/webhook-events";

export const dynamic = "force-dynamic";

// ============================================================
// CMA Resend webhook ingester.
//
// Per request:
//   1. Read raw body (svix signs the bytes, not parsed JSON).
//   2. Parse + extract email_id (Resend's provider_message_id).
//   3. Look up the cma_client_deliveries row by provider_message_id;
//      grab its email_connection_id.
//   4. Verify the svix signature against THAT connection's stored
//      signing secret. The attacker model: forged payload either
//      references a real email_id (signature won't match the
//      connection's secret) or a fake one (we can't find the row
//      and the request is a no-op). Either way safe.
//   5. Update the delivery row's engagement columns + counts.
//   6. Side-effects: unsubscribed / complained → set cma_clients.
//      unsubscribed_at + paused so the cadence-tick partial index
//      excludes the row from future scans.
// ============================================================

interface ResendPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    bounce?: { type?: string; message?: string };
    click?: { link?: string };
    tags?: Record<string, string>;
  };
}

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();

  // ---- 1. Raw body ----
  const rawBody = await req.text();
  if (!rawBody) {
    return Response.json({ error: "Empty body" }, { status: 400 });
  }

  let payload: ResendPayload;
  try {
    payload = JSON.parse(rawBody) as ResendPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resend's primary correlation handle. We also accept the
  // cma_delivery_id tag (set by sendCmaEmail) as a fallback for
  // events where Resend strips email_id (rare, but it's happened
  // on delivery_delayed events historically).
  const messageId =
    payload.data?.email_id ?? payload.data?.tags?.cma_delivery_id ?? null;
  if (!messageId) {
    return Response.json({ ok: true, ignored: "no email_id" });
  }

  // ---- 2-3. Look up delivery ----
  const lookupColumn = payload.data?.email_id
    ? "provider_message_id"
    : "id"; // tag-based fallback uses our own delivery uuid
  const { data: delivery } = await supabase
    .from("cma_client_deliveries")
    .select(
      "id, client_id, email_connection_id, opened_at, opened_count, clicked_at, clicked_count",
    )
    .eq(lookupColumn, messageId)
    .maybeSingle();

  if (!delivery) {
    // Unknown message — could be a stray Hyperlocal event hitting the
    // wrong endpoint (one Resend account, two webhooks pointing at
    // different apps). Quiet 200 so Resend doesn't retry.
    return Response.json({ ok: true, ignored: "delivery not found" });
  }
  if (!delivery.email_connection_id) {
    return Response.json(
      { ok: true, ignored: "delivery has no email_connection_id" },
    );
  }

  const { data: connection } = await supabase
    .from("cma_email_connections")
    .select("id, resend_webhook_secret_encrypted")
    .eq("id", delivery.email_connection_id)
    .maybeSingle();

  // ---- 4. Verify signature ----
  if (!connection?.resend_webhook_secret_encrypted) {
    // Refuse rather than silently accept — a connection that's missing
    // its signing secret almost always means the agent re-pasted their
    // API key without re-provisioning the webhook, and we don't want
    // forged events leaking through.
    return Response.json(
      { error: "Connection has no webhook secret configured" },
      { status: 401 },
    );
  }

  let secret: string;
  try {
    secret = decrypt(connection.resend_webhook_secret_encrypted);
  } catch {
    return Response.json(
      { error: "Webhook secret decrypt failed" },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 401 });
  }
  try {
    const wh = new Webhook(secret);
    wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ---- 5. Map + update ----
  const eventType = mapResendEventType(payload.type);
  if (!eventType) {
    return Response.json({
      ok: true,
      ignored: `unmapped type: ${payload.type}`,
    });
  }

  const occurredAt = payload.created_at
    ? new Date(payload.created_at).toISOString()
    : new Date().toISOString();

  const update: Record<string, unknown> = {};
  switch (eventType) {
    case "opened":
      update.opened_count = (delivery.opened_count ?? 0) + 1;
      if (!delivery.opened_at) update.opened_at = occurredAt;
      break;
    case "clicked":
      update.clicked_count = (delivery.clicked_count ?? 0) + 1;
      if (!delivery.clicked_at) update.clicked_at = occurredAt;
      // Clicks imply opens — if the ESP swallowed the open event but
      // delivered the click, we still want the opened state set.
      if (!delivery.opened_at) update.opened_at = occurredAt;
      break;
    case "bounced":
      update.bounced_at = occurredAt;
      break;
    case "complained":
      update.complained_at = occurredAt;
      break;
    case "delivered":
      // delivered_at is set by cma-deliver at send time. Leaving it
      // for engagement-only ESPs that fire delivered before bumping
      // their idea of "sent."
      break;
    default:
      // sent / delivery_delayed / unsubscribed / failed — no per-row
      // column. unsubscribed is handled below as a side-effect.
      break;
  }

  if (Object.keys(update).length > 0) {
    await supabase
      .from("cma_client_deliveries")
      .update(update)
      .eq("id", delivery.id);
  }

  // ---- 6. Side-effects on the client row ----
  if (eventType === "unsubscribed" || eventType === "complained") {
    await supabase
      .from("cma_clients")
      .update({
        unsubscribed_at: occurredAt,
        paused: true,
        updated_at: occurredAt,
      })
      .eq("id", delivery.client_id)
      .is("unsubscribed_at", null);
  }

  return Response.json({ ok: true, type: eventType });
}
