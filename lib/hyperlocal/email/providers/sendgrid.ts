import "server-only";

import { createVerify } from "node:crypto";
import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlEmailConnection } from "@/types/hyperlocal";
import type {
  EmailMessage,
  EmailProviderAdapter,
  NormalizedEspEvent,
  ProviderCapabilities,
  SendResult,
} from "./types";

// ============================================================
// SendGrid transactional adapter.
//
// BYO SendGrid — every connection brings its own API key. We never use
// a platform-wide SendGrid account; the agent owns the sending domain,
// the IP warmup, and the billing relationship.
//
// We talk to SendGrid via raw fetch instead of @sendgrid/mail because:
//   - No SDK version drift to babysit
//   - Smaller serverless cold-start
//   - SendGrid's REST is stable and well-documented
//
// Webhook signature uses Ed25519 (not HMAC like Resend) — we store the
// account's verification public key per-connection at setup time, then
// verify with node's built-in crypto. No svix or extra dep needed.
// ============================================================

const SG_BASE = "https://api.sendgrid.com/v3";

const SENDGRID_CAPABILITIES: ProviderCapabilities = {
  handles_compliance_footer: false,
  handles_unsubscribe: false,
  supports_per_contact_events: true,
  supports_merge_tags: false,
};

export const sendgridAdapter: EmailProviderAdapter = {
  mode: "transactional",
  capabilities: SENDGRID_CAPABILITIES,

  async send(conn: HlEmailConnection, msg: EmailMessage): Promise<SendResult> {
    const apiKey = requireApiKey(conn);

    const payload = {
      personalizations: [
        {
          to: [{ email: msg.to.email, name: msg.to.name }],
          headers: msg.headers,
        },
      ],
      from: { email: msg.from.email, name: msg.from.name },
      reply_to: msg.reply_to ? { email: msg.reply_to } : undefined,
      subject: msg.subject,
      content: [
        { type: "text/plain", value: msg.text },
        { type: "text/html", value: msg.html },
      ],
      // SendGrid "categories" are similar to Resend tags — strings, not k/v.
      // We flatten our k/v tags into "key:value" categories for filterability.
      categories: msg.tags
        ? Object.entries(msg.tags).map(([k, v]) => `${k}:${v}`).slice(0, 10)
        : undefined,
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking: { enable: true },
      },
    };

    let res: Response;
    try {
      res = await fetch(`${SG_BASE}/mail/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Transport failure — throw so Inngest retries.
      throw new Error(
        `SendGrid transport error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (res.status === 202) {
      // SendGrid returns 202 + a X-Message-Id header on success. No body.
      const messageId = res.headers.get("x-message-id") ?? undefined;
      return { success: true, provider_message_id: messageId };
    }

    // Read the error body once for both transient + terminal paths.
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }

    if (isTransientStatus(res.status)) {
      // 429 rate limit, 5xx — throw to retry. Don't terminally fail the recipient.
      throw new Error(
        `SendGrid transient ${res.status}: ${truncate(bodyText, 240)}`,
      );
    }

    // 4xx (other than 429) is terminal — bad payload, invalid recipient,
    // suspended sender, etc.
    return {
      success: false,
      error: `SendGrid ${res.status}: ${truncate(bodyText, 240)}`,
      is_hard_bounce: isHardBounceResponse(res.status, bodyText),
    };
  },

  /**
   * SendGrid signs each webhook payload with Ed25519 using the account's
   * verification key pair. The PUBLIC key lives on the connection
   * (we fetch it at setup time and stash it in provider_metadata.sendgrid).
   *
   * The signed payload is `timestamp + raw_body`, decoded base64, verified
   * against the public key (base64-encoded DER SPKI).
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Headers,
    publicKeyBase64: string,
  ): boolean {
    const signature = headers.get("x-twilio-email-event-webhook-signature");
    const timestamp = headers.get("x-twilio-email-event-webhook-timestamp");
    if (!signature || !timestamp || !publicKeyBase64) return false;

    try {
      const verifier = createVerify("sha256");
      verifier.update(timestamp + rawBody);
      verifier.end();
      // SendGrid distributes the public key as a base64-encoded DER.
      // node's crypto accepts PEM; wrap the DER as PEM SPKI.
      const pem =
        "-----BEGIN PUBLIC KEY-----\n" +
        publicKeyBase64.match(/.{1,64}/g)?.join("\n") +
        "\n-----END PUBLIC KEY-----\n";
      return verifier.verify(pem, signature, "base64");
    } catch {
      return false;
    }
  },

  /**
   * SendGrid posts an ARRAY of events per webhook call. Our adapter contract
   * returns a single NormalizedEspEvent — the route handles the array by
   * calling this once per element.
   */
  parseWebhookEvent(payload: unknown): NormalizedEspEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as {
      event?: string;
      sg_message_id?: string;
      email?: string;
      timestamp?: number;
      reason?: string;
      type?: string; // bounce vs block
    };
    const mapped = mapSendgridEvent(p.event);
    if (!mapped) return null;
    const messageId = stripMessageId(p.sg_message_id);
    if (!messageId) return null;
    return {
      type: mapped,
      provider_message_id: messageId,
      recipient_email: p.email ?? undefined,
      occurred_at: p.timestamp ? new Date(p.timestamp * 1000) : new Date(),
      bounce_type:
        p.event === "bounce" ? (p.type === "blocked" ? "soft" : "hard") : undefined,
      reason: p.reason ?? undefined,
      raw: payload,
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireApiKey(conn: HlEmailConnection): string {
  const encrypted =
    conn.provider_api_key_encrypted ?? conn.resend_api_key_encrypted;
  if (!encrypted) {
    throw new Error(
      "This SendGrid connection has no API key stored. Re-connect under Settings → Email.",
    );
  }
  return decrypt(encrypted);
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isHardBounceResponse(status: number, body: string): boolean {
  if (status === 400 || status === 422) {
    const lower = body.toLowerCase();
    return (
      lower.includes("invalid email") ||
      lower.includes("does not contain a valid address") ||
      lower.includes("recipient address rejected")
    );
  }
  return false;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * SendGrid's sg_message_id is "<message_id>.filterdrecv-<...>" — we want
 * just the message_id portion so it lines up across event types.
 */
function stripMessageId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const dot = raw.indexOf(".");
  return dot > 0 ? raw.slice(0, dot) : raw;
}

const EVENT_MAP: Record<string, NormalizedEspEvent["type"] | undefined> = {
  processed: "sent",
  delivered: "delivered",
  deferred: "delivery_delayed",
  bounce: "bounced",
  blocked: "bounced",
  dropped: "failed",
  spamreport: "complained",
  open: "opened",
  click: "clicked",
  unsubscribe: "unsubscribed",
  group_unsubscribe: "unsubscribed",
};

function mapSendgridEvent(
  event: string | undefined,
): NormalizedEspEvent["type"] | null {
  if (!event) return null;
  return EVENT_MAP[event] ?? null;
}
