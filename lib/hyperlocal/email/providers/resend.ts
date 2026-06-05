import { Resend } from "resend";
import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlEmailConnection } from "@/types/hyperlocal";
import type {
  EmailMessage,
  EmailProviderClient,
  SendResult,
} from "./types";

/**
 * BYO Resend: every Resend connection brings its own API key. We never share
 * a platform-wide Resend account across users — keeps reputation, billing,
 * and domain ownership entirely with the user.
 */
function clientForConnection(conn: HlEmailConnection): Resend {
  if (!conn.resend_api_key_encrypted) {
    throw new Error(
      "This Resend connection has no API key stored. Re-add it under Settings → Email."
    );
  }
  return new Resend(decrypt(conn.resend_api_key_encrypted));
}

/**
 * Convenience for routes that already have the plaintext key in hand
 * (verify-domain / check-domain).
 */
function clientForApiKey(apiKey: string): Resend {
  return new Resend(apiKey);
}

function formatFrom(msg: EmailMessage): string {
  return msg.from.name
    ? `${msg.from.name} <${msg.from.email}>`
    : msg.from.email;
}

export const resendProvider: EmailProviderClient = {
  async send(
    conn: HlEmailConnection,
    msg: EmailMessage
  ): Promise<SendResult> {
    try {
      const client = clientForConnection(conn);
      const res = await client.emails.send({
        from: formatFrom(msg),
        to: msg.to.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: msg.reply_to,
        headers: msg.headers,
        tags: msg.tags
          ? Object.entries(msg.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      });
      if (res.error) {
        return { success: false, error: res.error.message };
      }
      return {
        success: true,
        provider_message_id: res.data?.id,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

/**
 * Domain verification helpers — accept the plaintext key from the setup form
 * so we can validate it works before we encrypt + persist anything.
 */
export async function createResendDomain(
  apiKey: string,
  domain: string
): Promise<{ id: string; status: string; records?: unknown }> {
  const res = await clientForApiKey(apiKey).domains.create({ name: domain });
  if (res.error) throw new Error(res.error.message);
  return {
    id: res.data?.id ?? "",
    status: res.data?.status ?? "pending",
    records: res.data?.records,
  };
}

export async function getResendDomain(
  apiKey: string,
  id: string
): Promise<{ status: string; records?: unknown }> {
  const res = await clientForApiKey(apiKey).domains.get(id);
  if (res.error) throw new Error(res.error.message);
  return {
    status: res.data?.status ?? "pending",
    records: res.data?.records,
  };
}
