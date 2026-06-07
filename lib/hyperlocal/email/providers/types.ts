import type { HlEmailConnection } from "@/types/hyperlocal";

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

export interface EmailProviderClient {
  send(
    connection: HlEmailConnection,
    msg: EmailMessage
  ): Promise<SendResult>;
}

// ============================================================
// Domain verification (Resend)
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
}

// ============================================================
// ESP events — normalized across providers
//
// EspEvent is the unified shape the ingester and kill-switch
// logic read. Provider-specific webhook adapters (Resend today,
// Postmark / SES later) translate raw payloads into this.
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

export interface EspEvent {
  type: EspEventType;
  provider_message_id: string;
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
