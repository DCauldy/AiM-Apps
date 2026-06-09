import type { HlEmailConnection } from "@/types/hyperlocal";

// ============================================================
// Provider adapter interface — multi-ESP foundation.
//
// Two modes:
//   "transactional" — we own the recipient list and drive a per-recipient
//                     fan-out (Resend, SendGrid, Postmark, SES). The
//                     adapter just needs to send one message.
//   "campaign"      — the ESP owns the audience + fan-out. We sync
//                     contacts in, create a campaign object, trigger send,
//                     poll for status (Mailchimp, ActiveCampaign,
//                     Constant Contact, Klaviyo).
//
// `capabilities` lets the renderer + compliance gate know what the ESP
// handles natively so we don't double up footers, unsubscribes, etc.
// ============================================================

export type ProviderMode = "transactional" | "campaign";

export interface ProviderCapabilities {
  /** True for marketing ESPs that append their own CAN-SPAM footer to
   *  every send (physical address, account-level unsubscribe). When true
   *  we skip rendering our own footer to avoid double disclosures. */
  handles_compliance_footer: boolean;

  /** True when the ESP owns the unsubscribe link (writes to its own
   *  audience). When true we skip List-Unsubscribe headers + our JWT
   *  unsubscribe URL — their system is canonical. */
  handles_unsubscribe: boolean;

  /** True when the ESP webhooks fire per-contact engagement events
   *  (opens, clicks) tied to a recipient identifier we can map back.
   *  False = aggregate-only reporting; we don't get "Mary opened it." */
  supports_per_contact_events: boolean;

  /** True when the ESP's template engine resolves {{first_name}} style
   *  merge tags at send time. We use these instead of baking the value
   *  into HTML per-recipient. */
  supports_merge_tags: boolean;
}

// ============================================================
// Transactional mode types
// ============================================================

export interface EmailMessage {
  from: { email: string; name?: string };
  reply_to?: string;
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  provider_message_id?: string;
  is_hard_bounce?: boolean;
  error?: string;
}

// ============================================================
// Campaign mode types
// ============================================================

/** Single contact as Hyperlocal knows it — what we'd push into the ESP. */
export interface ContactUpsert {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  /** Additional merge fields (Mailchimp MERGEx, AC fields, etc.). The
   *  adapter knows how to map them onto its provider's schema. */
  merge_fields?: Record<string, string>;
}

/** ESP-side state for one of our candidate contacts. */
export type ContactStatus =
  | { state: "subscribed" }
  | { state: "unsubscribed" }
  | { state: "cleaned" } // ESP marked address invalid/bounced
  | { state: "pending" } // double-opt-in not confirmed
  | { state: "not_found" };

export interface ContactLookupRow {
  email: string;
  status: ContactStatus;
  tags?: string[];
}

export interface ContactLookupResult {
  rows: ContactLookupRow[];
}

export interface CampaignInput {
  subject: string;
  preheader: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  html: string;
  text: string;
  /** Provider-side audience identifier (e.g. Mailchimp audience_id) — the
   *  adapter resolves from connection.provider_metadata when not passed. */
  audience_id?: string;
  /** Tag name targeted within the audience. We use one tag per Hyperlocal
   *  run so the agent's audience structure stays clean. */
  tag: string;
}

export interface CampaignRef {
  campaign_id: string;
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "failed";

// ============================================================
// Webhook normalization
// ============================================================

export type EspEventType =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "unsubscribed"
  | "failed";

export interface NormalizedEspEvent {
  type: EspEventType;
  /** Provider message id when transactional, campaign id when campaign-mode. */
  provider_message_id: string;
  /** Recipient email — campaign-mode webhooks identify the contact by email
   *  rather than by our recipient_id. The ingester resolves it back to the
   *  hl_recipients row. */
  recipient_email?: string;
  occurred_at: Date;
  bounce_type?: "hard" | "soft";
  reason?: string;
  raw: unknown;
}

export class InvalidWebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "InvalidWebhookSignatureError";
  }
}

// ============================================================
// The adapter interface itself.
//
// Most methods are optional — a transactional adapter only fills in
// `send`, a campaign adapter only fills in the campaign methods. Callers
// switch on `mode` to know which to invoke. Webhook + signature methods
// are required for every provider.
// ============================================================

export interface EmailProviderAdapter {
  readonly mode: ProviderMode;
  readonly capabilities: ProviderCapabilities;

  // ---- Transactional mode ----
  send?(
    connection: HlEmailConnection,
    msg: EmailMessage,
  ): Promise<SendResult>;

  // ---- Campaign mode ----
  lookupContacts?(
    connection: HlEmailConnection,
    emails: string[],
  ): Promise<ContactLookupResult>;

  /** Add or update contacts in the ESP audience, tagged with the run's
   *  campaign tag so the upcoming campaign can target them. Should be a
   *  no-op for contacts already present with the tag. */
  upsertContacts?(
    connection: HlEmailConnection,
    contacts: ContactUpsert[],
    tag: string,
  ): Promise<void>;

  createCampaign?(
    connection: HlEmailConnection,
    input: CampaignInput,
  ): Promise<CampaignRef>;

  sendCampaign?(
    connection: HlEmailConnection,
    ref: CampaignRef,
  ): Promise<void>;

  getCampaignStatus?(
    connection: HlEmailConnection,
    ref: CampaignRef,
  ): Promise<CampaignStatus>;

  // ---- Webhooks (every provider) ----
  /** Verify the provider's signature header against the connection's
   *  stored webhook secret. Returns true when valid; the caller rejects
   *  401 on false. */
  verifyWebhookSignature(
    rawBody: string,
    headers: Headers,
    secret: string,
  ): boolean;

  /** Translate the provider's raw webhook payload into our normalized
   *  event shape. Returns null when the event type isn't one we care
   *  about (e.g. provider-internal admin events). */
  parseWebhookEvent(payload: unknown): NormalizedEspEvent | null;
}

// ============================================================
// Legacy alias — keep until call sites migrate
// ============================================================

/** @deprecated Migrate to EmailProviderAdapter. Kept so existing call
 *  sites compile while the refactor lands incrementally. */
export type EmailProviderClient = Pick<
  Required<EmailProviderAdapter>,
  "send"
>;

// ============================================================
// Domain verification (Resend-specific, kept for now)
// ============================================================

export type DomainStatus = "unverified" | "pending" | "verified" | "failed";

export interface DomainRecord {
  type: "TXT" | "CNAME" | "MX";
  name: string;
  value: string;
  priority?: number;
  ttl?: string | number;
}

export interface DomainSnapshot {
  resend_domain_id: string;
  status: DomainStatus;
  records: DomainRecord[];
  /** True when we reused an existing Resend domain instead of creating it.
   * Callers use this to skip rollback on DB-side failures. */
  reused?: boolean;
}
