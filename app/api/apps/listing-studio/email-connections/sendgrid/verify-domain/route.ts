import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import {
  getOrCreateSendgridDomain,
  setupSendgridWebhook,
} from "@/lib/hyperlocal/email/providers/sendgrid-setup";
import { getActiveProfile } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

const VALID_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * POST /api/apps/listing-studio/email-connections/sendgrid/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * Mirror of the Resend setup: idempotent domain authentication via
 * /v3/whitelabel/domains, best-effort event-webhook provisioning,
 * persist scoped to the active profile. SendGrid's webhook public
 * signing key (not a secret) is stashed in the connection so future
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

  const { count } = await service
    .from("cma_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profile?.id ?? null);

  const isActive = domainInfo.valid;
  const { data: row, error } = await service
    .from("cma_email_connections")
    .insert({
      user_id: user.id,
      profile_id: profile?.id ?? null,
      provider: "sendgrid",
      email_address: fromEmail,
      display_name: displayName,
      provider_api_key_encrypted: encrypt(apiKey),
      resend_domain: domain,
      resend_domain_id: String(domainInfo.domain_id),
      resend_dkim_status: domainInfo.valid ? "verified" : "pending",
      provider_metadata: {
        sendgrid: {
          domain_id: domainInfo.domain_id,
          webhook_endpoint: endpointUrl,
          webhook_error: webhookError,
          // Public signing key — not a secret, but encrypted-at-rest
          // anyway so the column shape is consistent with Resend.
          webhook_signing_public_key: signingPublicKey
            ? encrypt(signingPublicKey)
            : null,
        },
      },
      is_active: isActive,
      is_default: (count ?? 0) === 0 && isActive,
    })
    .select(
      "id, provider, email_address, display_name, is_active, is_default, resend_domain, resend_dkim_status, created_at",
    )
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    connection: row,
    dns_records: domainInfo.records,
    status: domainInfo.valid ? "verified" : "pending",
    reused: domainInfo.reused,
    webhook: signingPublicKey ? "provisioned" : "skipped",
    webhook_error: webhookError,
  });
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/cma/webhooks/sendgrid`;
  const origin = req.nextUrl.origin;
  return origin
    ? `${origin.replace(/\/+$/, "")}/api/cma/webhooks/sendgrid`
    : null;
}
