import "server-only";

import { getAdapter } from "@/lib/hyperlocal/email/providers/registry";
import type {
  EmailMessage,
  SendResult,
} from "@/lib/hyperlocal/email/providers/types";
import type { PlatformEmailConnection } from "@/types/platform-connections";

// ============================================================
// CMA email send facade.
//
// Wave 10 deleted the toHlEmailShim band-aid — sendCmaEmail now calls
// the Hyperlocal adapter directly with PlatformEmailConnection (the
// shared shape both apps consume).
//
// Used by:
//   - cma-deliver Inngest fn (Wave 4) for cadence sends
//   - /clients/[id]/send-now route (Wave 4) for manual sends
//
// Constrained to transactional providers (Resend, SendGrid) for v2.
// Campaign-mode providers (Mailchimp, ActiveCampaign) own the
// recipient list and don't fit the per-client cadence model; calls
// through them throw a clear error.
// ============================================================

export interface CmaEmail {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  /** Plain-text fallback. Most ESPs auto-generate when omitted, but
   *  providing one improves deliverability + lets ESPs that don't
   *  auto-generate (SendGrid) ship a useful version. */
  text: string;
  reply_to?: string;
  /** Custom headers — most commonly List-Unsubscribe for CAN-SPAM. */
  headers?: Record<string, string>;
  /** Provider tags for engagement reporting (Resend tag, etc.). */
  tags?: Record<string, string>;
}

/**
 * Send one CMA email through the agent's configured ESP.
 *
 * Returns the standard SendResult so callers can persist
 * provider_message_id on the cma_client_deliveries row for later
 * webhook correlation. Throws when the connection points at a
 * campaign-mode ESP — the CMA cadence is per-client and doesn't fit
 * the campaign-mode shape.
 */
export async function sendCmaEmail(
  conn: PlatformEmailConnection,
  email: CmaEmail,
): Promise<SendResult> {
  const adapter = getAdapter(conn.provider);

  if (adapter.mode !== "transactional" || !adapter.send) {
    throw new Error(
      `Provider "${conn.provider}" is a campaign-mode ESP. CMA delivery requires a transactional ESP (Resend or SendGrid).`,
    );
  }

  const message: EmailMessage = {
    from: {
      email: conn.email_address,
      name: conn.display_name ?? undefined,
    },
    reply_to: email.reply_to ?? conn.email_address,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
    tags: email.tags,
  };

  return adapter.send(conn, message);
}
