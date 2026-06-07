import { Resend } from "resend";
import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlEmailConnection } from "@/types/hyperlocal";
import type {
  DomainRecord,
  DomainSnapshot,
  DomainStatus,
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
): Promise<DomainSnapshot> {
  const res = await clientForApiKey(apiKey).domains.create({ name: domain });
  if (res.error) throw new Error(res.error.message);
  return {
    resend_domain_id: res.data?.id ?? "",
    status: normalizeDomainStatus(res.data?.status),
    records: normalizeDomainRecords(res.data?.records),
  };
}

export async function getResendDomain(
  apiKey: string,
  id: string
): Promise<DomainSnapshot> {
  const res = await clientForApiKey(apiKey).domains.get(id);
  if (res.error) throw new Error(res.error.message);
  return {
    resend_domain_id: id,
    status: normalizeDomainStatus(res.data?.status),
    records: normalizeDomainRecords(res.data?.records),
  };
}

/**
 * Kicks off DNS verification with Resend. Resend re-checks the domain's
 * DKIM/SPF records and updates status. Returns the latest snapshot so the
 * caller can reflect it in hl_email_connections.resend_dkim_status.
 */
export async function verifyResendDomain(
  apiKey: string,
  id: string
): Promise<DomainSnapshot> {
  const verify = await clientForApiKey(apiKey).domains.verify(id);
  if (verify.error) throw new Error(verify.error.message);
  return getResendDomain(apiKey, id);
}

export async function deleteResendDomain(
  apiKey: string,
  id: string
): Promise<void> {
  const res = await clientForApiKey(apiKey).domains.remove(id);
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// Internal: shape normalizers
// ---------------------------------------------------------------------------

function normalizeDomainStatus(raw: unknown): DomainStatus {
  if (raw === "verified" || raw === "pending" || raw === "failed") return raw;
  return "unverified";
}

function normalizeDomainRecords(raw: unknown): DomainRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: unknown): DomainRecord | null => {
      if (!r || typeof r !== "object") return null;
      const rec = r as Record<string, unknown>;
      const type = typeof rec.type === "string" ? rec.type.toUpperCase() : "";
      if (type !== "TXT" && type !== "CNAME" && type !== "MX") return null;
      const name = typeof rec.name === "string" ? rec.name : "";
      const value = typeof rec.value === "string" ? rec.value : "";
      if (!name || !value) return null;
      return {
        type: type as DomainRecord["type"],
        name,
        value,
        priority: typeof rec.priority === "number" ? rec.priority : undefined,
        ttl:
          typeof rec.ttl === "string" || typeof rec.ttl === "number"
            ? rec.ttl
            : undefined,
      };
    })
    .filter((r): r is DomainRecord => r !== null);
}
