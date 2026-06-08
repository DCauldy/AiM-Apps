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
    let res;
    try {
      const client = clientForConnection(conn);
      res = await client.emails.send({
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
    } catch (e) {
      // Network / transport failure — never reached Resend or response was
      // garbled. Throw so Inngest's retries:3 kicks in.
      throw new Error(
        `Resend transport error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!res.error) {
      return { success: true, provider_message_id: res.data?.id };
    }

    if (isTransientResendError(res.error)) {
      // Throw to retry; do NOT return success:false (which would terminally
      // fail the recipient).
      throw new Error(`Resend transient error: ${res.error.message}`);
    }

    // Terminal error: bad address, invalid sender, rejected content. No
    // retry will help — mark recipient failed and move on.
    return {
      success: false,
      error: res.error.message,
      is_hard_bounce: isHardBounceError(res.error),
    };
  },
};

function isTransientResendError(error: { name?: string; message?: string }): boolean {
  // Resend SDK exposes a `name` discriminator; the names below are
  // network/server-side faults that may pass on retry. Anything else
  // (validation, missing key, blocked sender) is terminal.
  const transientNames = new Set([
    "rate_limit_exceeded",
    "application_error",
    "internal_server_error",
  ]);
  if (error.name && transientNames.has(error.name)) return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("timeout") ||
    m.includes("temporarily") ||
    m.includes("try again")
  );
}

function isHardBounceError(error: { name?: string; message?: string }): boolean {
  if (error.name === "invalid_to_address") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("invalid recipient") || m.includes("mailbox not found");
}

/**
 * Domain verification helpers — accept the plaintext key from the setup form
 * so we can validate it works before we encrypt + persist anything.
 *
 * Resend rejects domains.create with "already been registered" when the same
 * API key's account already has the domain — including domains the user
 * verified previously via the Resend dashboard, or a prior attempt that
 * succeeded on Resend's side but failed locally. We fall back to looking up
 * the existing domain so the agent can wire it up without manual cleanup.
 */
export async function getOrCreateResendDomain(
  apiKey: string,
  domain: string
): Promise<DomainSnapshot> {
  const client = clientForApiKey(apiKey);
  const created = await client.domains.create({ name: domain });

  if (!created.error) {
    return {
      resend_domain_id: created.data?.id ?? "",
      status: normalizeDomainStatus(created.data?.status),
      records: normalizeDomainRecords(created.data?.records),
      reused: false,
    };
  }

  if (!isDuplicateDomainError(created.error)) {
    throw new Error(created.error.message);
  }

  // Already registered on this Resend account — look it up and reuse it.
  const list = await client.domains.list();
  if (list.error) {
    throw new Error(`Couldn't list Resend domains: ${list.error.message}`);
  }

  const existing = findDomainByName(list.data as unknown, domain);
  if (!existing?.id) {
    throw new Error(
      `Resend reports "${domain}" is already registered, but it wasn't found ` +
        `when listing domains on this API key. Double-check the key and domain.`,
    );
  }

  // domains.list returns a slim record; fetch the full one to get records/status.
  const snapshot = await getResendDomain(apiKey, existing.id);
  return { ...snapshot, reused: true };
}

/** @deprecated Use getOrCreateResendDomain — kept temporarily for callers that
 *  haven't been migrated. Forwards through with the new tolerant behavior. */
export const createResendDomain = getOrCreateResendDomain;

function isDuplicateDomainError(error: { name?: string; message?: string }): boolean {
  // Resend's wording for this case has varied — observed examples include:
  //   "This domain has already been registered."
  //   "The example.com domain has been registered already."
  //   "Domain already exists."
  // Match on "already" + ("registered" | "exists") in either word order
  // rather than chasing exact phrasings.
  if (error.name === "domain_already_exists") return true;
  const m = (error.message ?? "").toLowerCase();
  if (!m.includes("already")) return false;
  return m.includes("registered") || m.includes("exists");
}

function findDomainByName(raw: unknown, name: string): { id: string } | null {
  const target = name.toLowerCase();
  // Resend SDK's list response is typed differently across versions —
  // handle both `{ data: [...] }` and `[...]` shapes.
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] } | null)?.data)
      ? (raw as { data: unknown[] }).data
      : [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const recName = typeof rec.name === "string" ? rec.name.toLowerCase() : "";
    const id = typeof rec.id === "string" ? rec.id : "";
    if (recName === target && id) return { id };
  }
  return null;
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
// Webhook provisioning
// ---------------------------------------------------------------------------

/** Events the Hyperlocal ingester knows how to handle. Kept in sync with the
 *  type enum in hl_email_events + the mapper in webhook-events.ts. */
const HYPERLOCAL_WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.unsubscribed",
  "email.failed",
] as const;

export interface WebhookProvisionResult {
  webhook_id: string;
  signing_secret: string;
  reused: boolean;
}

/**
 * Provision (or fetch) a Resend webhook for our endpoint.
 *
 * If `existingWebhookId` is provided, fetch its signing secret via the GET
 * endpoint and return that — no creation. Otherwise list webhooks, look for
 * one already pointing to `endpointUrl` (an agent might have created one
 * manually, or another connection sharing this API key already provisioned
 * it), and reuse it. Falls through to create.
 *
 * Note: Resend's webhooks are account-scoped, not domain-scoped. Two of our
 * connections sharing one API key SHOULD reuse the same webhook so events
 * fire once.
 */
export async function getOrCreateResendWebhook(
  apiKey: string,
  endpointUrl: string,
  existingWebhookId?: string | null,
): Promise<WebhookProvisionResult> {
  const client = clientForApiKey(apiKey);

  if (existingWebhookId) {
    const got = await client.webhooks.get(existingWebhookId);
    if (!got.error && got.data?.signing_secret) {
      return {
        webhook_id: got.data.id,
        signing_secret: got.data.signing_secret,
        reused: true,
      };
    }
    // Stored id is stale (webhook deleted in Resend dashboard) — fall through
    // and treat it as a fresh provision.
  }

  // Look for an existing webhook on this account that already targets our
  // endpoint, to avoid duplicates when the API key is shared.
  const list = await client.webhooks.list();
  if (list.error) {
    throw new Error(`Couldn't list Resend webhooks: ${list.error.message}`);
  }
  const match = (list.data?.data ?? []).find(
    (w) => normalizeUrl(w.endpoint) === normalizeUrl(endpointUrl),
  );
  if (match) {
    const got = await client.webhooks.get(match.id);
    if (got.error || !got.data?.signing_secret) {
      throw new Error(
        `Found existing Resend webhook ${match.id} but couldn't fetch its signing secret`,
      );
    }
    return {
      webhook_id: got.data.id,
      signing_secret: got.data.signing_secret,
      reused: true,
    };
  }

  // Create.
  const created = await client.webhooks.create({
    endpoint: endpointUrl,
    events: HYPERLOCAL_WEBHOOK_EVENTS as unknown as Parameters<
      typeof client.webhooks.create
    >[0]["events"],
  });
  if (created.error) {
    throw new Error(`Resend webhook create failed: ${created.error.message}`);
  }
  if (!created.data?.signing_secret) {
    throw new Error("Resend created the webhook but returned no signing secret");
  }
  return {
    webhook_id: created.data.id,
    signing_secret: created.data.signing_secret,
    reused: false,
  };
}

export async function deleteResendWebhook(
  apiKey: string,
  webhookId: string,
): Promise<void> {
  const res = await clientForApiKey(apiKey).webhooks.remove(webhookId);
  // Best-effort: ignore 404 (already deleted in Resend dashboard).
  if (res.error && !/(not.?found|404)/i.test(res.error.message)) {
    throw new Error(res.error.message);
  }
}

function normalizeUrl(url: string): string {
  // Strip trailing slash + lowercase for tolerant matching.
  return url.replace(/\/+$/, "").toLowerCase();
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
