import { Webhook, WebhookVerificationError } from "svix";

import {
  type EspEvent,
  type EspEventType,
  InvalidWebhookSignatureError,
} from "./types";

// ---------------------------------------------------------------------------
// Verification — Resend signs webhooks via svix. Each connection brings
// its own webhook signing secret (BYO Resend, per `hl_email_connections`),
// so the caller passes it in. The svix headers are required and must be
// forwarded verbatim from the inbound request.
// ---------------------------------------------------------------------------

export interface ResendWebhookInput {
  rawBody: string;
  headers: {
    "svix-id"?: string | null;
    "svix-timestamp"?: string | null;
    "svix-signature"?: string | null;
  };
}

/**
 * Verify a Resend webhook signature and parse the payload into one or more
 * unified ESP events. Throws `InvalidWebhookSignatureError` on missing or
 * invalid signature — the caller should return 400 in that case so Resend
 * retries against a corrected secret.
 */
export function verifyAndParseResendWebhook(
  webhookSecret: string,
  input: ResendWebhookInput
): EspEvent[] {
  const id = input.headers["svix-id"];
  const timestamp = input.headers["svix-timestamp"];
  const signature = input.headers["svix-signature"];
  if (!id || !timestamp || !signature) {
    throw new InvalidWebhookSignatureError(
      "Missing svix-id, svix-timestamp, or svix-signature header"
    );
  }

  let payload: unknown;
  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(input.rawBody, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      throw new InvalidWebhookSignatureError(err.message);
    }
    throw err;
  }

  // Resend posts one event per webhook delivery, but we accept arrays for
  // forward-compat with potential batched payloads.
  const items = Array.isArray(payload) ? payload : [payload];
  const events: EspEvent[] = [];
  for (const item of items) {
    const normalized = normalizeResendEvent(item);
    if (normalized) events.push(normalized);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Event normalization
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, EspEventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
};

function normalizeResendEvent(raw: unknown): EspEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rawType = typeof r.type === "string" ? r.type : "";
  const type = TYPE_MAP[rawType];
  if (!type) return null;

  const data =
    r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};

  // Resend uses `email_id` on event payloads; older payloads may use `id`.
  const providerMessageId =
    (typeof data.email_id === "string" && data.email_id) ||
    (typeof data.id === "string" && data.id) ||
    "";
  if (!providerMessageId) return null;

  const createdAt = typeof r.created_at === "string" ? new Date(r.created_at) : new Date();

  const event: EspEvent = {
    type,
    provider_message_id: providerMessageId,
    occurred_at: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
    raw,
  };

  if (type === "bounced") {
    const bounce =
      data.bounce && typeof data.bounce === "object"
        ? (data.bounce as Record<string, unknown>)
        : null;
    if (bounce) {
      const bounceType = typeof bounce.type === "string" ? bounce.type : "";
      // Resend mirrors AWS SES — "Permanent" => hard, "Transient" => soft.
      if (bounceType) {
        event.bounce_type = bounceType.toLowerCase().startsWith("perm")
          ? "hard"
          : "soft";
      }
      event.reason =
        (typeof bounce.message === "string" && bounce.message) ||
        (typeof bounce.subType === "string" && bounce.subType) ||
        undefined;
    }
  } else if (type === "complained") {
    const complaint =
      data.complaint && typeof data.complaint === "object"
        ? (data.complaint as Record<string, unknown>)
        : null;
    event.reason =
      (complaint && typeof complaint.type === "string" && complaint.type) ||
      "spam_report";
  } else if (type === "failed") {
    event.reason =
      (typeof data.reason === "string" && data.reason) ||
      (typeof data.error === "string" && data.error) ||
      undefined;
  }

  return event;
}
