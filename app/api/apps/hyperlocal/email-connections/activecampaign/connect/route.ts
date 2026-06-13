import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createAppEmailConnection,
  getAppEmailConnectionStateInternal,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import {
  acListSubscriberCount,
  acV3,
  normalizeAcBaseUrl,
  type AcAuth,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import { getActiveProfile } from "@/lib/profiles/server";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/activecampaign/connect
 * Body: { api_url, api_key, list_id?, display_name? }
 *
 * Validates by hitting /users/me. Picks the requested list (or the first
 * one on the account). Persists the connection encrypted, replacing any
 * prior sending connection on this profile (one-at-a-time enforcement).
 *
 * Webhooks: a fresh URL secret is generated and stored on the per-app
 * webhook_secret_encrypted column.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rawUrl = String(body.api_url ?? "").trim();
  const apiKey = String(body.api_key ?? "").trim();
  const requestedListId = body.list_id ? String(body.list_id).trim() : null;
  const displayName = body.display_name
    ? String(body.display_name).trim()
    : null;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "ActiveCampaign API key is required (Settings → Developer in AC).",
      },
      { status: 400 },
    );
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeAcBaseUrl(rawUrl);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid API URL" },
      { status: 400 },
    );
  }

  const auth: AcAuth = { baseUrl, apiKey, listId: null };

  // ---- Validate the key by fetching the authenticated user ----
  let accountEmail: string | null = null;
  let accountName: string | null = null;
  try {
    const me = await acV3<{
      user?: {
        email?: string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
    }>(auth, "GET", "/users/me");
    accountEmail = me.user?.email ?? null;
    accountName =
      [me.user?.first_name, me.user?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      me.user?.username ||
      null;
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Couldn't reach ActiveCampaign with that URL + key: ${e.message}`
            : "Couldn't validate the API credentials.",
      },
      { status: 400 },
    );
  }

  // ---- Pick the list ----
  let lists: Array<{
    id: string;
    name: string;
    subscriber_count?: string | number;
  }>;
  try {
    const data = await acV3<{
      lists: Array<{
        id: string;
        name: string;
        subscriber_count?: string | number;
      }>;
    }>(auth, "GET", "/lists?limit=100");
    lists = data.lists ?? [];
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Couldn't list audiences: ${e.message}`
            : "List lookup failed.",
      },
      { status: 500 },
    );
  }

  if (lists.length === 0) {
    return Response.json(
      {
        error:
          "No lists found on this ActiveCampaign account. Create one in AC → Contacts → Lists, then retry.",
      },
      { status: 400 },
    );
  }

  const list = lists.find((l) => l.id === requestedListId) ?? lists[0];
  // AC's /lists endpoint doesn't return subscriber_count — fetch it via
  // /contactLists with status=1 (active). Falls back to 0 on error.
  const memberCount = await acListSubscriberCount(auth, list.id);

  // ---- Provision webhook (best-effort, skipped on localhost) ----
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
      const wh = await acV3<{ webhook?: { id: string } }>(
        auth,
        "POST",
        "/webhooks",
        {
          webhook: {
            name: `Hyperlocal — ${new Date().toISOString().slice(0, 10)}`,
            url: endpointUrl,
            events: ["unsubscribe", "bounce", "sent", "open", "click"],
            sources: ["admin", "api", "system"],
          },
        },
      );
      webhookId = wh.webhook?.id ?? null;
    } catch (e) {
      webhookError =
        e instanceof Error ? e.message : "Webhook provisioning failed";
    }
  } else if (endpointUrl) {
    webhookError =
      "Skipped webhook setup — ActiveCampaign can't reach localhost. Set NEXT_PUBLIC_APP_URL to a tunnel and reconnect.";
  }

  // ---- Persist connection ----
  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      {
        error:
          "No active profile — set one up before connecting ActiveCampaign.",
      },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // One sending connection per profile — stash prior for auto-disconnect.
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
    activecampaign: {
      account_url: baseUrl,
      list_id: Number(list.id) || undefined,
    },
  };
  // Free-form extras land alongside the typed fields.
  Object.assign(providerMetadata.activecampaign as Record<string, unknown>, {
    base_url: baseUrl,
    list_name: list.name,
    member_count: memberCount,
    account_name: accountName,
    account_email: accountEmail,
    webhook_id: webhookId,
    webhook_error: webhookError,
  });

  try {
    const connection = await createAppEmailConnection(service, "hyperlocal", {
      userId: user.id,
      profileId: profile.id,
      provider: "activecampaign",
      emailAddress:
        accountEmail ?? `activecampaign:${list.id}@${hostFromUrl(baseUrl)}`,
      displayName: displayName ?? accountName ?? list.name,
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
      list: { id: list.id, name: list.name, member_count: memberCount },
      lists_available: lists.length,
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

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "activecampaign";
  }
}

function resolveWebhookEndpoint(
  req: NextRequest,
  secret: string,
): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const origin = base || req.nextUrl.origin?.replace(/\/+$/, "") || null;
  if (!origin) return null;
  return `${origin}/api/webhooks/activecampaign?secret=${encodeURIComponent(secret)}`;
}
