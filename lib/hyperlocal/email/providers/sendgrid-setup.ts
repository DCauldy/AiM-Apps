import "server-only";

// ============================================================
// SendGrid setup helpers — domain authentication + event webhook
// provisioning. Mirror the shape of the Resend setup helpers so the
// connection-setup routes can stay close in spirit even though the APIs
// differ underneath.
// ============================================================

const SG_BASE = "https://api.sendgrid.com/v3";

export interface SendgridDomainSnapshot {
  domain_id: number;
  domain: string;
  valid: boolean;
  records: SendgridDnsRecord[];
  reused: boolean;
}

export interface SendgridDnsRecord {
  type: string; // CNAME / TXT / MX
  host: string;
  data: string;
  valid?: boolean;
}

interface SgDomainResponse {
  id: number;
  domain: string;
  valid: boolean;
  dns?: Record<
    string,
    { type: string; host: string; data: string; valid?: boolean }
  >;
}

/**
 * Idempotent domain auth — list first, reuse if present, create otherwise.
 * Mirrors getOrCreateResendDomain.
 */
export async function getOrCreateSendgridDomain(
  apiKey: string,
  domain: string,
): Promise<SendgridDomainSnapshot> {
  // List existing whitelabeled domains.
  const list = await sgFetch<SgDomainResponse[]>(apiKey, "GET", "/whitelabel/domains?limit=200");
  const existing = list.find((d) => d.domain.toLowerCase() === domain.toLowerCase());
  if (existing) {
    const full = await sgFetch<SgDomainResponse>(
      apiKey,
      "GET",
      `/whitelabel/domains/${existing.id}`,
    );
    return {
      domain_id: full.id,
      domain: full.domain,
      valid: full.valid,
      records: flattenDns(full.dns),
      reused: true,
    };
  }

  // Create. Subdomain default is "em" — SendGrid's docs use that for the
  // CNAME records. Auto-security keeps DKIM/SPF managed by SendGrid.
  const created = await sgFetch<SgDomainResponse>(apiKey, "POST", "/whitelabel/domains", {
    domain,
    subdomain: "em",
    automatic_security: true,
  });
  return {
    domain_id: created.id,
    domain: created.domain,
    valid: created.valid,
    records: flattenDns(created.dns),
    reused: false,
  };
}

export async function getSendgridDomain(
  apiKey: string,
  id: number,
): Promise<SendgridDomainSnapshot> {
  const data = await sgFetch<SgDomainResponse>(apiKey, "GET", `/whitelabel/domains/${id}`);
  return {
    domain_id: data.id,
    domain: data.domain,
    valid: data.valid,
    records: flattenDns(data.dns),
    reused: true,
  };
}

export async function validateSendgridDomain(
  apiKey: string,
  id: number,
): Promise<{ valid: boolean; records: SendgridDnsRecord[] }> {
  // POST returns validation per-record + overall.
  const result = await sgFetch<{
    id: number;
    valid: boolean;
    validation_results?: Record<string, { valid: boolean; reason: string | null }>;
  }>(apiKey, "POST", `/whitelabel/domains/${id}/validate`);
  // Re-fetch to get fresh DNS list with validity flags.
  const fresh = await getSendgridDomain(apiKey, id);
  return { valid: result.valid, records: fresh.records };
}

// ---------------------------------------------------------------------------
// Event webhook provisioning
// ---------------------------------------------------------------------------

export interface SendgridWebhookProvisionResult {
  signing_public_key: string;
  reused: boolean;
}

interface SgWebhookSettings {
  enabled: boolean;
  url: string;
  group_resubscribe?: boolean;
  delivered?: boolean;
  group_unsubscribe?: boolean;
  spam_report?: boolean;
  bounce?: boolean;
  deferred?: boolean;
  unsubscribe?: boolean;
  processed?: boolean;
  open?: boolean;
  click?: boolean;
  dropped?: boolean;
}

/**
 * Configure SendGrid's event webhook + enable signed payloads. There's
 * exactly ONE event webhook config per SendGrid account, so this is
 * upsert-by-nature — running it twice is idempotent.
 *
 * Returns the verification public key (base64) — we store it on the
 * connection so verifyWebhookSignature() can authenticate later events.
 */
export async function setupSendgridWebhook(
  apiKey: string,
  endpointUrl: string,
): Promise<SendgridWebhookProvisionResult> {
  // Check if already pointing at our URL.
  const current = await sgFetch<SgWebhookSettings>(
    apiKey,
    "GET",
    "/user/webhooks/event/settings",
  );
  const reused = current.url === endpointUrl && current.enabled === true;

  if (!reused) {
    const settings: SgWebhookSettings = {
      enabled: true,
      url: endpointUrl,
      delivered: true,
      bounce: true,
      deferred: true,
      spam_report: true,
      unsubscribe: true,
      group_unsubscribe: true,
      group_resubscribe: false,
      open: true,
      click: true,
      dropped: true,
      processed: true,
    };
    await sgFetch<unknown>(apiKey, "PATCH", "/user/webhooks/event/settings", settings);
  }

  // Enable signed event webhook + fetch the public key.
  const signed = await sgFetch<{ enabled: boolean; public_key: string }>(
    apiKey,
    "PATCH",
    "/user/webhooks/event/settings/signed",
    { enabled: true },
  );

  return {
    signing_public_key: signed.public_key,
    reused,
  };
}

// ---------------------------------------------------------------------------
// Internal — minimal REST helper
// ---------------------------------------------------------------------------

async function sgFetch<T>(
  apiKey: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${SG_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SendGrid ${method} ${path} → ${res.status}: ${text.slice(0, 280)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

function flattenDns(
  dns: SgDomainResponse["dns"] | undefined,
): SendgridDnsRecord[] {
  if (!dns) return [];
  return Object.values(dns).map((r) => ({
    type: r.type.toUpperCase(),
    host: r.host,
    data: r.data,
    valid: r.valid,
  }));
}
