import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import {
  acListSubscriberCount,
  acV3,
  normalizeAcBaseUrl,
  type AcAuth,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/activecampaign/connect
 * Body: { api_url, api_key, list_id?, display_name? }
 *
 * Validates by hitting /users/me. Picks the requested list (or the first
 * one on the account). Persists the connection encrypted, replacing any
 * prior sending connection on this profile (one-at-a-time enforcement).
 *
 * Webhooks are not provisioned in Phase 1 — they ship with the run
 * pipeline in Phase 2.
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
      { error: "ActiveCampaign API key is required (Settings → Developer in AC)." },
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
      user?: { email?: string; username?: string; first_name?: string; last_name?: string };
    }>(auth, "GET", "/users/me");
    accountEmail = me.user?.email ?? null;
    accountName =
      [me.user?.first_name, me.user?.last_name].filter(Boolean).join(" ").trim() ||
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
  let lists: Array<{ id: string; name: string; subscriber_count?: string | number }>;
  try {
    const data = await acV3<{
      lists: Array<{ id: string; name: string; subscriber_count?: string | number }>;
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

  const list =
    lists.find((l) => l.id === requestedListId) ?? lists[0];
  // AC's /lists endpoint doesn't return subscriber_count — fetch it via
  // /contactLists with status=1 (active). Falls back to 0 on error.
  const memberCount = await acListSubscriberCount(auth, list.id);

  // ---- Provision webhook (best-effort, skipped on localhost) ----
  // AC doesn't sign payloads — we append a URL secret at provisioning
  // time and the receiver compares timing-safely. Subscribe to the
  // events the pipeline cares about; "subscribe"/"update" are noisy
  // and not actionable for us so we skip them.
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
  const service = createServiceRoleClient();
  const { data: profileMeta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileMeta?.active_profile_id) {
    return Response.json(
      { error: "No active profile — set one up before connecting ActiveCampaign." },
      { status: 400 },
    );
  }
  const profileId = profileMeta.active_profile_id;

  // One sending connection per profile — stash prior for auto-disconnect.
  const { data: priorConnection } = await service
    .from("hl_email_connections")
    .select(
      "id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_api_key_encrypted, provider_oauth_access_token_encrypted, provider_metadata",
    )
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
      provider: "activecampaign",
      email_address: accountEmail ?? `activecampaign:${list.id}@${hostFromUrl(baseUrl)}`,
      display_name: displayName ?? accountName ?? list.name,
      provider_api_key_encrypted: encrypt(apiKey),
      // Shared secret column — AC's URL secret feeds verifyWebhookSignature.
      resend_webhook_secret_encrypted: encrypt(webhookSecret),
      provider_metadata: {
        activecampaign: {
          base_url: baseUrl,
          list_id: list.id,
          list_name: list.name,
          member_count: memberCount,
          account_name: accountName,
          account_email: accountEmail,
          webhook_id: webhookId,
          webhook_error: webhookError,
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
    list: { id: list.id, name: list.name, member_count: memberCount },
    lists_available: lists.length,
    webhook: webhookId ? "provisioned" : "skipped",
    webhook_error: webhookError,
    replaced: priorConnection?.provider ?? null,
  });
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
