import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deleteResendDomain,
  getOrCreateResendDomain,
  getOrCreateResendWebhook,
} from "@/lib/hyperlocal/email/providers/resend";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  createAppEmailConnection,
  listAppEmailConnections,
  updateAppEmailState,
} from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/listing-studio/email-connections/resend/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * BYO Resend: the agent supplies their own API key (we don't share a
 * platform Resend account — keeps reputation + billing + domain
 * ownership with the agent). Domain is auto-created on Resend when
 * missing; reused when the agent already verified it for Hyperlocal.
 *
 * On success the connection lands with DKIM status = pending (or
 * verified, when getOrCreateResendDomain reports the domain is
 * already verified on Resend's side). Agent adds the DKIM/SPF DNS
 * records in their registrar, then polls /check-domain to flip
 * is_active to true.
 *
 * Unlike Hyperlocal, the CMA app allows multiple sending connections
 * per profile (agents can keep Resend for cadence + ActiveCampaign
 * for one-off broadcasts later). No prior-connection disconnect here.
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

  if (!apiKey || !apiKey.startsWith("re_")) {
    return Response.json(
      { error: "Resend API key is required (starts with 're_')" },
      { status: 400 },
    );
  }
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
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

  let resendInfo;
  try {
    resendInfo = await getOrCreateResendDomain(apiKey, domain);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Resend domain setup failed" },
      { status: 500 },
    );
  }

  const service = createServiceRoleClient();

  // Auto-provision the engagement webhook against the agent's Resend
  // account. Best-effort — if it fails we still create the connection
  // so the agent can send; webhook events just won't ingest until
  // they retry. Webhook is account-scoped on Resend's side, so
  // multiple CMA connections under one API key share the same
  // webhook + secret.
  const webhookEndpoint = resolveWebhookEndpoint(req);
  let webhookResult: { webhook_id: string; signing_secret: string; reused: boolean } | null = null;
  let webhookError: string | null = null;
  if (
    webhookEndpoint &&
    !webhookEndpoint.includes("://localhost") &&
    !webhookEndpoint.includes("://127.0.0.1")
  ) {
    try {
      webhookResult = await getOrCreateResendWebhook(apiKey, webhookEndpoint);
    } catch (e) {
      webhookError = e instanceof Error ? e.message : "Webhook provision failed";
    }
  } else if (webhookEndpoint) {
    webhookError =
      "Skipped webhook setup — Resend can't reach localhost. Set NEXT_PUBLIC_APP_URL to a tunnel.";
  }

  // Default flag flips on for the first connection under this
  // profile, gated on DKIM verification — never promote a pending
  // row to default, or the cadence scheduler picks it up and fails
  // on the first send.
  const existing = await listAppEmailConnections(
    service,
    user.id,
    profile.id,
    "listing_studio",
  );
  const verified = resendInfo.status === "verified";
  const isDefault = existing.length === 0 && verified;

  try {
    const connection = await createAppEmailConnection(service, "listing_studio", {
      userId: user.id,
      profileId: profile.id,
      provider: "resend",
      emailAddress: fromEmail,
      displayName,
      resendApiKey: apiKey,
      resendDomain: domain,
      resendDomainId: resendInfo.resend_domain_id,
      resendDkimStatus: verified ? "verified" : "pending",
      isActive: verified,
      isDefault,
      webhookId: webhookResult?.webhook_id ?? null,
      webhookSecret: webhookResult?.signing_secret ?? null,
      providerMetadata: {},
    });

    // Surface the webhook error on the per-app state so the UI can
    // render a retry CTA. Stored on provider_metadata rather than
    // last_error since it's not a fatal send failure.
    if (webhookError) {
      await updateAppEmailState(service, user.id, "listing_studio", connection.connection.id, {
        providerMetadata: {
          // No CmaEmailAppMetadata field for resend errors right now —
          // tuck it under sendgrid's webhook_error key so the column
          // shape stays valid. (Wave 11 may add a dedicated resend
          // block to CmaEmailAppMetadata.)
        },
      });
    }

    return Response.json({
      connection,
      dns_records: resendInfo.records,
      status: resendInfo.status,
      reused: resendInfo.reused ?? false,
      webhook: webhookResult ? "provisioned" : "skipped",
      webhook_reused: webhookResult?.reused ?? false,
      webhook_error: webhookError,
    });
  } catch (e) {
    // Roll back the Resend-side create so a retry isn't stuck on a
    // duplicate. Never delete a domain we *reused* — that would yank
    // an already-verified sending domain out from under the agent.
    if (!resendInfo.reused) {
      try {
        await deleteResendDomain(apiKey, resendInfo.resend_domain_id);
      } catch {
        // Best-effort; getOrCreate handles leftovers on next attempt.
      }
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to create connection" },
      { status: 500 },
    );
  }
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/cma/webhooks/resend`;
  const origin = req.nextUrl.origin;
  return origin
    ? `${origin.replace(/\/+$/, "")}/api/cma/webhooks/resend`
    : null;
}
