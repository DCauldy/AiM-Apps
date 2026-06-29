import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createAppEmailConnection,
  getAppEmailConnectionStateInternal,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import {
  getOrCreateSendgridDomain,
  setupSendgridWebhook,
} from "@/lib/hyperlocal/email/providers/sendgrid-setup";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest } from "next/server";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

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
 * The signing public key (not a secret) is stored on app_state.webhook_secret_encrypted
 * so signature verification works without re-fetching.
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

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      {
        error:
          "No active profile — set one up before connecting a sending account",
      },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Stash prior connection so we can disconnect it AFTER the new one is
  // persisted. UI gates this with a confirm modal.
  const existing = await listAppEmailConnections(
    service,
    user.id,
    profile.id,
    "hyperlocal",
  );
  const priorPair = existing[0] ?? null;
  let priorRef: Parameters<typeof disconnectPriorConnection>[1] | null = null;
  if (priorPair) {
    const priorState = await getAppEmailConnectionStateInternal(
      service,
      "hyperlocal",
      priorPair.connection.id,
    );
    const { data: priorPlatform } = await service
      .from("platform_email_connections")
      .select("*")
      .eq("id", priorPair.connection.id)
      .maybeSingle();
    priorRef = priorPlatform
      ? {
          id: priorPlatform.id,
          provider: priorPlatform.provider,
          resend_webhook_id: priorState?.webhook_id ?? null,
          resend_domain_id: priorPlatform.resend_domain_id,
          resend_api_key_encrypted: priorPlatform.resend_api_key_encrypted,
          provider_api_key_encrypted: priorPlatform.provider_api_key_encrypted,
          provider_oauth_access_token_encrypted:
            priorPlatform.provider_oauth_access_token_encrypted,
          provider_metadata: (priorState?.provider_metadata ?? null) as Record<
            string,
            unknown
          > | null,
        }
      : null;
  }

  // ---- Authenticate the domain (idempotent) ----
  let domainInfo;
  try {
    domainInfo = await getOrCreateSendgridDomain(apiKey, domain);
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "SendGrid domain setup failed",
      },
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

  const isActive = domainInfo.valid;
  const providerMetadata: HlEmailAppMetadata = {
    sendgrid: {
      domain_id: domainInfo.domain_id,
      webhook_endpoint: endpointUrl ?? undefined,
      webhook_error: webhookError,
    },
  };

  try {
    const connection = await createAppEmailConnection(service, "hyperlocal", {
      userId: user.id,
      profileId: profile.id,
      provider: "sendgrid",
      emailAddress: fromEmail,
      displayName,
      providerApiKey: apiKey,
      resendDomain: domain,
      resendDomainId: String(domainInfo.domain_id),
      resendDkimStatus: isActive ? "verified" : "pending",
      isActive,
      isDefault: existing.length === 0 && isActive,
      // SendGrid's webhook signing public key is stored as the per-app
      // webhook secret so verifyWebhookSignature() finds it in the same
      // slot as Resend's signing secret.
      webhookSecret: signingPublicKey ?? null,
      providerMetadata,
    });

    if (priorRef && priorRef.id !== connection.connection.id) {
      await disconnectPriorConnection(service, priorRef);
    }

    return Response.json({
      connection: connection.connection,
      dns_records: domainInfo.records,
      status: domainInfo.valid ? "verified" : "pending",
      reused: domainInfo.reused,
      webhook: signingPublicKey ? "provisioned" : "skipped",
      webhook_error: webhookError,
      replaced: priorRef?.provider ?? null,
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Failed to persist connection",
      },
      { status: 500 },
    );
  }
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/webhooks/sendgrid`;
  const origin = req.nextUrl.origin;
  return origin
    ? `${origin.replace(/\/+$/, "")}/api/webhooks/sendgrid`
    : null;
}
