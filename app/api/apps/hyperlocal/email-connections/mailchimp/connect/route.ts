import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { randomBytes } from "node:crypto";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { NextRequest } from "next/server";

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
 * URL-secret approach is their documented pattern.
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
  let audiences: Array<{ id: string; name: string; stats?: { member_count?: number } }>;
  try {
    const data = await mcFetch<{
      lists: Array<{ id: string; name: string; stats?: { member_count?: number } }>;
    }>(apiKey, dc, "GET", "/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count");
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
  const service = createServiceRoleClient();
  const { data: profileMeta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileMeta?.active_profile_id) {
    return Response.json(
      { error: "No active profile — set one up before connecting Mailchimp" },
      { status: 400 },
    );
  }
  const profileId = profileMeta.active_profile_id;

  // One sending connection per profile — stash prior for auto-disconnect
  // after the new one is persisted. UI confirms with the agent first.
  const { data: priorConnection } = await service
    .from("hl_email_connections")
    .select("id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_api_key_encrypted, provider_oauth_access_token_encrypted, provider_metadata")
    .eq("user_id", user.id)
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

  const { count } = await service
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  const { data: row, error } = await service
    .from("hl_email_connections")
    .insert({
      user_id: user.id,
      profile_id: profileId,
      provider: "mailchimp",
      email_address: accountEmail ?? `mailchimp:${audience.id}@${dc}`,
      display_name: displayName ?? audience.name,
      provider_api_key_encrypted: encrypt(apiKey),
      // Shared secret column — Mailchimp's URL secret feeds verifyWebhookSignature.
      resend_webhook_secret_encrypted: encrypt(webhookSecret),
      provider_metadata: {
        mailchimp: {
          dc,
          audience_id: audience.id,
          audience_name: audience.name,
          webhook_id: webhookId,
          webhook_error: webhookError,
          member_count: audience.stats?.member_count ?? null,
        },
      },
      is_active: true,
      is_default: (count ?? 0) === 0,
    })
    .select(
      "id, provider, email_address, display_name, is_active, is_default, provider_metadata, created_at",
    )
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (priorConnection && priorConnection.id !== row.id) {
    await disconnectPriorConnection(service, priorConnection);
  }

  return Response.json({
    connection: row,
    audience: { id: audience.id, name: audience.name, member_count: audience.stats?.member_count ?? null },
    audiences_available: audiences.length,
    webhook: webhookId ? "provisioned" : "skipped",
    webhook_error: webhookError,
    replaced: priorConnection?.provider ?? null,
  });
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
    throw new Error(`Mailchimp ${method} ${path} → ${res.status}: ${text.slice(0, 280)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
