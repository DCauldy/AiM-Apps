import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createAppEmailConnection,
  getAppEmailConnectionStateInternal,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import { randomBytes } from "node:crypto";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest } from "next/server";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/mailchimp/connect
 * Body: { api_key, audience_id?, display_name? }
 *
 * v1 setup: agent pastes their Mailchimp API key (format: "key-us12"). We
 * split out the datacenter, validate the key via /ping, list audiences,
 * pick the chosen one (or default to the first), auto-provision a webhook,
 * and persist the connection.
 *
 * The webhook secret is generated locally and appended to the webhook URL
 * as ?secret=... — Mailchimp doesn't sign payloads by default, and this
 * URL-secret approach is their documented pattern. We store the secret on
 * app_email_connection_state.webhook_secret_encrypted (per-app scope).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = String(body.api_key ?? "").trim();
  const requestedAudienceId = body.audience_id
    ? String(body.audience_id).trim()
    : null;
  const displayName = body.display_name
    ? String(body.display_name).trim()
    : null;

  // Mailchimp keys look like "abc123def456-us12" — datacenter is the part
  // after the last dash.
  const dashIdx = apiKey.lastIndexOf("-");
  if (dashIdx < 0 || dashIdx === apiKey.length - 1) {
    return Response.json(
      {
        error:
          "Mailchimp API key must be in 'key-us12' format. Get one at mailchimp.com → Profile → Extras → API keys.",
      },
      { status: 400 },
    );
  }
  const dc = apiKey.slice(dashIdx + 1);

  // ---- Validate the key + fetch account info ----
  let accountEmail: string | null = null;
  try {
    const ping = await mcFetch<{ account_id: string; email: string }>(
      apiKey,
      dc,
      "GET",
      "/?fields=account_id,email",
    );
    accountEmail = ping.email;
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Couldn't reach Mailchimp with that key: ${e.message}`
            : "Couldn't validate the API key.",
      },
      { status: 400 },
    );
  }

  // ---- Pick the audience ----
  let audiences: Array<{
    id: string;
    name: string;
    stats?: { member_count?: number };
  }>;
  try {
    const data = await mcFetch<{
      lists: Array<{
        id: string;
        name: string;
        stats?: { member_count?: number };
      }>;
    }>(
      apiKey,
      dc,
      "GET",
      "/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count",
    );
    audiences = data.lists ?? [];
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Couldn't list audiences: ${e.message}`
            : "Audience lookup failed.",
      },
      { status: 500 },
    );
  }

  if (audiences.length === 0) {
    return Response.json(
      {
        error:
          "No audiences found on this Mailchimp account. Create one at mailchimp.com → Audience → Create Audience, then retry.",
      },
      { status: 400 },
    );
  }

  const audience =
    audiences.find((a) => a.id === requestedAudienceId) ?? audiences[0];

  // ---- Provision webhook (best-effort) ----
  // Mailchimp webhooks are per-audience. We append a random secret as a URL
  // query param — the adapter's verifyWebhookSignature compares timing-safely.
  const webhookSecret = randomBytes(24).toString("hex");
  const endpointUrl = resolveWebhookEndpoint(req, webhookSecret);
  let webhookId: string | null = null;
  let webhookError: string | null = null;
  if (
    endpointUrl &&
    !endpointUrl.includes("://localhost") &&
    !endpointUrl.includes("://127.0.0.1")
  ) {
    try {
      const wh = await mcFetch<{ id: string }>(
        apiKey,
        dc,
        "POST",
        `/lists/${audience.id}/webhooks`,
        {
          url: endpointUrl,
          events: {
            subscribe: false,
            unsubscribe: true,
            profile: false,
            cleaned: true,
            upemail: false,
            campaign: true,
          },
          sources: {
            user: true,
            admin: true,
            api: true,
          },
        },
      );
      webhookId = wh.id;
    } catch (e) {
      webhookError =
        e instanceof Error ? e.message : "Webhook provisioning failed";
    }
  } else if (endpointUrl) {
    webhookError =
      "Skipped webhook setup — Mailchimp can't reach localhost. Set NEXT_PUBLIC_APP_URL to a tunnel and reconnect.";
  }

  // ---- Persist connection ----
  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "No active profile — set one up before connecting Mailchimp" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // One sending connection per profile — stash prior for auto-disconnect
  // after the new one is persisted. UI confirms with the agent first.
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

  const providerMetadata: HlEmailAppMetadata = {
    mailchimp: {
      dc,
      audience_id: audience.id,
      server_prefix: dc,
    },
  };
  // Stash audience name + webhook id under the mailchimp namespace too —
  // they're outside the HlEmailAppMetadata strict shape but the JSONB
  // column is open-ended, and downstream readers look them up by path.
  (providerMetadata.mailchimp as Record<string, unknown>).audience_name =
    audience.name;
  (providerMetadata.mailchimp as Record<string, unknown>).webhook_id = webhookId;
  (providerMetadata.mailchimp as Record<string, unknown>).webhook_error =
    webhookError;
  (providerMetadata.mailchimp as Record<string, unknown>).member_count =
    audience.stats?.member_count ?? null;

  try {
    const connection = await createAppEmailConnection(service, "hyperlocal", {
      userId: user.id,
      profileId: profile.id,
      provider: "mailchimp",
      emailAddress: accountEmail ?? `mailchimp:${audience.id}@${dc}`,
      displayName: displayName ?? audience.name,
      providerApiKey: apiKey,
      webhookSecret,
      providerMetadata,
      isActive: true,
      isDefault: existing.length === 0,
    });

    if (priorRef && priorRef.id !== connection.connection.id) {
      await disconnectPriorConnection(service, priorRef);
    }

    return Response.json({
      connection: connection.connection,
      audience: {
        id: audience.id,
        name: audience.name,
        member_count: audience.stats?.member_count ?? null,
      },
      audiences_available: audiences.length,
      webhook: webhookId ? "provisioned" : "skipped",
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

function resolveWebhookEndpoint(
  req: NextRequest,
  secret: string,
): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const origin = base || req.nextUrl.origin?.replace(/\/+$/, "") || null;
  if (!origin) return null;
  return `${origin}/api/webhooks/mailchimp?secret=${encodeURIComponent(secret)}`;
}

const MC_API_VERSION = "3.0";

async function mcFetch<T>(
  apiKey: string,
  dc: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `https://${dc}.api.mailchimp.com/${MC_API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`hl:${apiKey}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Mailchimp ${method} ${path} → ${res.status}: ${text.slice(0, 280)}`,
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
