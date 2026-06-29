import "server-only";

import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { sendgridAdapter } from "@/lib/hyperlocal/email/providers/sendgrid";
import { getAppEmailConnectionStateInternal } from "@/lib/platform/connections";
import type { CmaEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

// ============================================================
// CMA SendGrid event webhook receiver.
//
// SendGrid posts an ARRAY of events per delivery (open + click +
// delivered roll up). We:
//   1. Read raw body (ECDSA-P256 signature is over the bytes)
//   2. Pull the first event's sg_message_id, resolve the delivery row
//   3. Verify the signature against the connection's stored public key
//   4. Iterate events, update cma_client_deliveries engagement columns
//      + side-effect cma_clients on unsubscribed/complained
//
// The signing public key is stored on
// cma_email_connections.provider_metadata.sendgrid.webhook_signing_public_key
// (AES-encrypted at rest by the verify-domain route).
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

  // ---- Resolve the delivery via the first event's message id ----
  const firstNormalized = sendgridAdapter.parseWebhookEvent(events[0]);
  if (!firstNormalized) {
    return Response.json({ ok: true, ignored: "no parseable event" });
  }
  const messageId = firstNormalized.provider_message_id;

  const { data: delivery } = await supabase
    .from("cma_client_deliveries")
    .select(
      "id, client_id, email_connection_id, opened_at, opened_count, clicked_at, clicked_count",
    )
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (!delivery) {
    return Response.json({ ok: true, ignored: "delivery not found" });
  }
  if (!delivery.email_connection_id) {
    return Response.json(
      { ok: true, ignored: "delivery has no email_connection_id" },
    );
  }

  // The signing PUBLIC key now lives on the per-app state row's
  // provider_metadata.sendgrid block (the per-app webhook URL means each
  // app's signing key is independent of the other's).
  const appState = await getAppEmailConnectionStateInternal(
    supabase,
    "listing_studio",
    delivery.email_connection_id,
  );
  const meta = (appState?.provider_metadata ?? {}) as CmaEmailAppMetadata;
  const encryptedPublicKey = meta.sendgrid?.webhook_signing_public_key ?? null;

  if (!encryptedPublicKey) {
    return Response.json(
      { error: "Connection has no SendGrid webhook public key configured" },
      { status: 401 },
    );
  }

  let publicKey: string;
  try {
    publicKey = decrypt(encryptedPublicKey);
  } catch {
    return Response.json(
      { error: "Public key decrypt failed" },
      { status: 500 },
    );
  }

  const ok = sendgridAdapter.verifyWebhookSignature(
    rawBody,
    req.headers,
    publicKey,
  );
  if (!ok) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ---- Walk the batch, accumulate the delivery updates ----
  //
  // SendGrid often sends opened+delivered+open in one batch. To avoid
  // five round trips per webhook call, we accumulate the final state
  // locally then write once at the end.
  let openCount = delivery.opened_count ?? 0;
  let clickCount = delivery.clicked_count ?? 0;
  let openedAt = delivery.opened_at ?? null;
  let clickedAt = delivery.clicked_at ?? null;
  let bouncedAt: string | null = null;
  let complainedAt: string | null = null;
  let unsubscribedAt: string | null = null;
  let processed = 0;

  for (const raw of events) {
    const normalized = sendgridAdapter.parseWebhookEvent(raw);
    if (!normalized) continue;
    processed += 1;
    const occurredAt = normalized.occurred_at.toISOString();

    switch (normalized.type) {
      case "opened":
        openCount += 1;
        if (!openedAt) openedAt = occurredAt;
        break;
      case "clicked":
        clickCount += 1;
        if (!clickedAt) clickedAt = occurredAt;
        if (!openedAt) openedAt = occurredAt; // click implies open
        break;
      case "bounced":
        bouncedAt = occurredAt;
        break;
      case "complained":
        complainedAt = occurredAt;
        break;
      case "unsubscribed":
        unsubscribedAt = occurredAt;
        break;
      default:
        break;
    }
  }

  const update: Record<string, unknown> = {};
  if (openCount !== (delivery.opened_count ?? 0)) update.opened_count = openCount;
  if (openedAt && openedAt !== delivery.opened_at) update.opened_at = openedAt;
  if (clickCount !== (delivery.clicked_count ?? 0)) update.clicked_count = clickCount;
  if (clickedAt && clickedAt !== delivery.clicked_at) update.clicked_at = clickedAt;
  if (bouncedAt) update.bounced_at = bouncedAt;
  if (complainedAt) update.complained_at = complainedAt;

  if (Object.keys(update).length > 0) {
    await supabase
      .from("cma_client_deliveries")
      .update(update)
      .eq("id", delivery.id);
  }

  // ---- Side-effects on client row ----
  if (unsubscribedAt || complainedAt) {
    await supabase
      .from("cma_clients")
      .update({
        unsubscribed_at: unsubscribedAt ?? complainedAt,
        paused: true,
        updated_at: unsubscribedAt ?? complainedAt,
      })
      .eq("id", delivery.client_id)
      .is("unsubscribed_at", null);
  }

  return Response.json({
    ok: true,
    events_received: events.length,
    events_processed: processed,
  });
}
