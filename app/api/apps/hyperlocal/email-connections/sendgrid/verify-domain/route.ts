import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import {
  getOrCreateSendgridDomain,
  setupSendgridWebhook,
} from "@/lib/hyperlocal/email/providers/sendgrid-setup";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const VALID_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * POST /api/apps/hyperlocal/email-connections/sendgrid/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * BYO SendGrid mirror of the Resend setup route:
 *   1. Idempotent domain authentication via /v3/whitelabel/domains
 *   2. Auto-provision the event webhook + fetch the signing public key
 *   3. Persist connection scoped to the active profile
 *
 * The signing public key (not a secret) is stored on the connection so
 * future webhook signature verification works without re-fetching.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = String(body.api_key ?? "").trim();
  const domain = String(body.domain ?? "").trim().toLowerCase();
  const fromEmail = String(body.from_email ?? "").trim().toLowerCase();
  const displayName = body.display_name
    ? String(body.display_name).trim()
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

  const service = createServiceRoleClient();
  const { data: profileMeta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileMeta?.active_profile_id) {
    return Response.json(
      { error: "No active profile — set one up before connecting a sending account" },
      { status: 400 },
    );
  }
  const profileId = profileMeta.active_profile_id;

  // Stash prior connection so we can disconnect it AFTER the new one is
  // persisted. UI gates this with a confirm modal.
  const { data: priorConnection } = await service
    .from("hl_email_connections")
    .select("id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_api_key_encrypted, provider_oauth_access_token_encrypted, provider_metadata")
    .eq("user_id", user.id)
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

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
  // SendGrid only allows one webhook config per account, so this is
  // upsert-by-nature. We resolve the endpoint URL from the prod app URL —
  // local dev should expose a tunnel and set NEXT_PUBLIC_APP_URL.
  const endpointUrl = resolveWebhookEndpoint(req);
  let signingPublicKey: string | null = null;
  let webhookError: string | null = null;
  if (endpointUrl && !endpointUrl.includes("://localhost") && !endpointUrl.includes("://127.0.0.1")) {
    try {
      const result = await setupSendgridWebhook(apiKey, endpointUrl);
      signingPublicKey = result.signing_public_key;
    } catch (e) {
      // Don't fail the whole setup — agent can retry webhook provisioning
      // from the connection panel after manual cleanup.
      webhookError = e instanceof Error ? e.message : "Webhook setup failed";
    }
  } else if (endpointUrl) {
    webhookError =
      "Skipped webhook setup — SendGrid can't reach localhost. Set NEXT_PUBLIC_APP_URL to a tunnel and re-provision from the connection panel.";
  }

  // ---- Count existing SendGrid connections under this profile for default flag ----
  const { count } = await service
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  // ---- Persist ----
  const isActive = domainInfo.valid;
  const { data: row, error } = await service
    .from("hl_email_connections")
    .insert({
      user_id: user.id,
      profile_id: profileId,
      provider: "sendgrid",
      email_address: fromEmail,
      display_name: displayName,
      provider_api_key_encrypted: encrypt(apiKey),
      // SendGrid's webhook signing PUBLIC key (not a shared secret) sits
      // in the existing column so verifyWebhookSignature() finds it via
      // the same field as Resend's signing secret.
      resend_webhook_secret_encrypted: signingPublicKey
        ? encrypt(signingPublicKey)
        : null,
      resend_domain: domain,
      resend_domain_id: String(domainInfo.domain_id),
      resend_dkim_status: domainInfo.valid ? "verified" : "pending",
      provider_metadata: {
        sendgrid: {
          domain_id: domainInfo.domain_id,
          webhook_endpoint: endpointUrl,
          webhook_error: webhookError,
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

  if (priorConnection && priorConnection.id !== row.id) {
    await disconnectPriorConnection(service, priorConnection);
  }

  return Response.json({
    connection: row,
    dns_records: domainInfo.records,
    status: domainInfo.valid ? "verified" : "pending",
    reused: domainInfo.reused,
    webhook: signingPublicKey ? "provisioned" : "skipped",
    webhook_error: webhookError,
    replaced: priorConnection?.provider ?? null,
  });
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/webhooks/sendgrid`;
  const origin = req.nextUrl.origin;
  return origin ? `${origin.replace(/\/+$/, "")}/api/webhooks/sendgrid` : null;
}
