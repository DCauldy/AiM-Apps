import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import {
  getOrCreateSendgridDomain,
  setupSendgridWebhook,
} from "@/lib/hyperlocal/email/providers/sendgrid-setup";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  createAppEmailConnection,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import type { CmaEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

const VALID_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * POST /api/apps/listing-studio/email-connections/sendgrid/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * Mirror of the Resend setup: idempotent domain authentication via
 * /v3/whitelabel/domains, best-effort event-webhook provisioning,
 * persist scoped to the active profile. SendGrid's webhook public
 * signing key (not a secret) is stashed in provider_metadata so future
 * webhook signature verification works without a re-fetch.
 *
 * NB: SendGrid allows only one event webhook per account. If the
 * agent already runs a Hyperlocal SendGrid connection, provisioning
 * here clobbers the prior webhook URL. The CMA webhook handler will
 * be at /api/cma/webhooks/sendgrid (Wave 5).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const apiKey = String((body as { api_key?: unknown }).api_key ?? "").trim();
  const domain = String((body as { domain?: unknown }).domain ?? "")
    .trim()
    .toLowerCase();
  const fromEmail = String((body as { from_email?: unknown }).from_email ?? "")
    .trim()
    .toLowerCase();
  const displayName = (body as { display_name?: unknown }).display_name
    ? String((body as { display_name: unknown }).display_name).trim()
    : null;

  if (!apiKey || !apiKey.startsWith("SG.")) {
    return Response.json(
      { error: "SendGrid API key is required (starts with 'SG.')" },
      { status: 400 },
    );
  }
  if (!VALID_DOMAIN.test(domain)) {
    return Response.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (!fromEmail || !fromEmail.endsWith("@" + domain)) {
    return Response.json(
      { error: `from_email must be on the verified domain (${domain})` },
      { status: 400 },
    );
  }

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "An active profile is required to add an email connection." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // ---- Authenticate the domain (idempotent) ----
  let domainInfo;
  try {
    domainInfo = await getOrCreateSendgridDomain(apiKey, domain);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "SendGrid domain setup failed" },
      { status: 500 },
    );
  }

  // ---- Provision the event webhook (best-effort) ----
  const endpointUrl = resolveWebhookEndpoint(req);
  let signingPublicKey: string | null = null;
  let webhookError: string | null = null;
  if (
    endpointUrl &&
    !endpointUrl.includes("://localhost") &&
    !endpointUrl.includes("://127.0.0.1")
  ) {
    try {
      const result = await setupSendgridWebhook(apiKey, endpointUrl);
      signingPublicKey = result.signing_public_key;
    } catch (e) {
      webhookError = e instanceof Error ? e.message : "Webhook setup failed";
    }
  } else if (endpointUrl) {
    webhookError =
      "Skipped webhook setup — SendGrid can't reach localhost. Set NEXT_PUBLIC_APP_URL to a tunnel and re-provision from the connection panel.";
  }

  const existing = await listAppEmailConnections(
    service,
    user.id,
    profile.id,
    "listing_studio",
  );
  const isActive = domainInfo.valid;
  const isDefault = existing.length === 0 && isActive;

  // Provider metadata: SendGrid bits live under the sendgrid sub-key
  // per CmaEmailAppMetadata. Signing key is encrypted-at-rest so the
  // column shape stays consistent with how Resend secrets are
  // handled — public key by nature, but the encrypt() wrap keeps the
  // pattern aligned and obscures it from casual DB inspection.
  const providerMetadata: CmaEmailAppMetadata = {
    sendgrid: {
      domain_id: domainInfo.domain_id,
      webhook_endpoint: endpointUrl ?? undefined,
      webhook_error: webhookError,
      webhook_signing_public_key: signingPublicKey
        ? encrypt(signingPublicKey)
        : null,
    },
  };

  try {
    const connection = await createAppEmailConnection(service, "listing_studio", {
      userId: user.id,
      profileId: profile.id,
      provider: "sendgrid",
      emailAddress: fromEmail,
      displayName,
      providerApiKey: apiKey,
      resendDomain: domain,
      resendDomainId: String(domainInfo.domain_id),
      resendDkimStatus: domainInfo.valid ? "verified" : "pending",
      isActive,
      isDefault,
      providerMetadata,
    });

    return Response.json({
      connection,
      dns_records: domainInfo.records,
      status: domainInfo.valid ? "verified" : "pending",
      reused: domainInfo.reused,
      webhook: signingPublicKey ? "provisioned" : "skipped",
      webhook_error: webhookError,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to create connection" },
      { status: 500 },
    );
  }
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/cma/webhooks/sendgrid`;
  const origin = req.nextUrl.origin;
  return origin
    ? `${origin.replace(/\/+$/, "")}/api/cma/webhooks/sendgrid`
    : null;
}
