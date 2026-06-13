import { createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { randomBytes } from "node:crypto";
import { jwtVerify } from "jose";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function stateSecret(): Uint8Array | null {
  const raw =
    process.env.HYPERLOCAL_UNSUBSCRIBE_SECRET ??
    process.env.AIM_APP_TOKEN_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

/**
 * GET /api/apps/hyperlocal/email-connections/mailchimp/oauth/callback
 *
 * Mailchimp redirects here after the agent approves the OAuth grant. We:
 *   1. Validate the CSRF state cookie matches the returned ?state
 *   2. Exchange the ?code for an access token (form-encoded POST per Mailchimp docs)
 *   3. Fetch /oauth2/metadata to get the agent's datacenter + api_endpoint
 *   4. List their audiences via the Marketing API, auto-pick the first
 *   5. Auto-provision a webhook with a URL secret
 *   6. Persist the connection scoped to the active profile
 *   7. Redirect back to Settings → Email with a success param
 *
 * Tokens don't expire (per Mailchimp's OAuth docs — no refresh token needed).
 * Revocation by the user invalidates the token immediately.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Mailchimp signals user-denied / errors via ?error=... rather than ?code=.
  if (oauthError) {
    return redirectToSettings(req, `mailchimp_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !returnedState) {
    return redirectToSettings(req, "mailchimp_error=missing_code_or_state");
  }

  // The state is a signed JWT we created in /start carrying the user id.
  // Verifying the signature gives us BOTH CSRF protection (only we could
  // have signed it) AND the session identity (uid claim) without depending
  // on cross-site cookie delivery, which Chromium-based browsers can strip.
  const secret = stateSecret();
  if (!secret) {
    return redirectToSettings(req, "mailchimp_error=state_secret_missing");
  }
  let userId: string;
  try {
    const { payload } = await jwtVerify(returnedState, secret, {
      issuer: "aim-hyperlocal",
      audience: "mc-oauth",
    });
    if (typeof payload.uid !== "string") {
      return redirectToSettings(req, "mailchimp_error=state_no_user");
    }
    userId = payload.uid;
  } catch (e) {
    console.error("[mailchimp/oauth/callback] state verify failed:", e instanceof Error ? e.message : e);
    return redirectToSettings(req, "mailchimp_error=state_invalid");
  }

  // Resolve the active profile once so every downstream redirect can
  // land the agent back on /apps/profile/[id]?tab=mail with the new
  // Mailchimp card visible. null fallback (no active profile) drops
  // to the profile-list page instead.
  const activeProfile = await getActiveProfile(userId);
  const activeProfileId: string | null = activeProfile?.id ?? null;

  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectToSettings(req, "mailchimp_error=oauth_not_configured", activeProfileId);
  }

  const redirectUri = resolveRedirectUri(req);

  // ---- 2. Exchange the code for an access token ----
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      return redirectToSettings(
        req,
        `mailchimp_error=token_exchange&detail=${encodeURIComponent(text.slice(0, 120))}`,
        activeProfileId,
      );
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return redirectToSettings(req, "mailchimp_error=no_access_token", activeProfileId);
    }
    accessToken = tokenJson.access_token;
  } catch (e) {
    return redirectToSettings(
      req,
      `mailchimp_error=token_exchange&detail=${encodeURIComponent(e instanceof Error ? e.message : "")}`,
      activeProfileId,
    );
  }

  // ---- 3. Fetch metadata (datacenter + api endpoint) ----
  let dc: string;
  let accountEmail: string | null = null;
  let loginName: string | null = null;
  try {
    const metaRes = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => "");
      return redirectToSettings(
        req,
        `mailchimp_error=metadata&detail=${encodeURIComponent(text.slice(0, 120))}`,
        activeProfileId,
      );
    }
    const meta = (await metaRes.json()) as {
      dc?: string;
      login?: { email?: string; login_name?: string };
    };
    if (!meta.dc) {
      return redirectToSettings(req, "mailchimp_error=missing_dc", activeProfileId);
    }
    dc = meta.dc;
    accountEmail = meta.login?.email ?? null;
    loginName = meta.login?.login_name ?? null;
  } catch (e) {
    return redirectToSettings(
      req,
      `mailchimp_error=metadata&detail=${encodeURIComponent(e instanceof Error ? e.message : "")}`,
      activeProfileId,
    );
  }

  // ---- 4. List audiences, pick the first ----
  let audience: { id: string; name: string; memberCount: number | null };
  try {
    const listRes = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count`,
      { headers: { Authorization: `OAuth ${accessToken}` } },
    );
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => "");
      return redirectToSettings(
        req,
        `mailchimp_error=audience_list&detail=${encodeURIComponent(text.slice(0, 120))}`,
        activeProfileId,
      );
    }
    const listJson = (await listRes.json()) as {
      lists: Array<{ id: string; name: string; stats?: { member_count?: number } }>;
    };
    const audiences = listJson.lists ?? [];
    if (audiences.length === 0) {
      return redirectToSettings(req, "mailchimp_error=no_audiences", activeProfileId);
    }
    const first = audiences[0];
    audience = {
      id: first.id,
      name: first.name,
      memberCount: first.stats?.member_count ?? null,
    };
  } catch (e) {
    return redirectToSettings(
      req,
      `mailchimp_error=audience_list&detail=${encodeURIComponent(e instanceof Error ? e.message : "")}`,
      activeProfileId,
    );
  }

  // ---- 5. Auto-provision webhook (best-effort) ----
  const webhookSecret = randomBytes(24).toString("hex");
  const webhookUrl = resolveWebhookUrl(req, webhookSecret);
  let webhookId: string | null = null;
  let webhookError: string | null = null;
  if (
    webhookUrl &&
    !webhookUrl.includes("://localhost") &&
    !webhookUrl.includes("://127.0.0.1")
  ) {
    try {
      const wh = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/lists/${audience.id}/webhooks`,
        {
          method: "POST",
          headers: {
            Authorization: `OAuth ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: webhookUrl,
            events: {
              subscribe: false,
              unsubscribe: true,
              profile: false,
              cleaned: true,
              upemail: false,
              campaign: true,
            },
            sources: { user: true, admin: true, api: true },
          }),
        },
      );
      if (wh.ok) {
        const whJson = (await wh.json()) as { id?: string };
        webhookId = whJson.id ?? null;
      } else {
        const text = await wh.text().catch(() => "");
        webhookError = text.slice(0, 200);
      }
    } catch (e) {
      webhookError = e instanceof Error ? e.message : "webhook provision failed";
    }
  } else if (webhookUrl) {
    webhookError =
      "Webhook skipped — localhost isn't reachable from Mailchimp. Set NEXT_PUBLIC_APP_URL to a tunnel and reconnect.";
  }

  // ---- 6. Persist the connection ----
  const service = createServiceRoleClient();
  const { data: profileMeta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profileMeta?.active_profile_id) {
    return redirectToSettings(req, "mailchimp_error=no_active_profile", activeProfileId);
  }
  const profileId = profileMeta.active_profile_id;

  // Stash any prior connection so we can auto-disconnect it after the new
  // Mailchimp connection is persisted. UI gates with a confirm modal.
  const { data: priorConnection } = await service
    .from("hl_email_connections")
    .select("id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_api_key_encrypted, provider_oauth_access_token_encrypted, provider_metadata")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

  const { count } = await service
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("profile_id", profileId);

  const { data: insertedRow, error: insertErr } = await service
    .from("hl_email_connections")
    .insert({
      user_id: userId,
      profile_id: profileId,
      provider: "mailchimp",
      email_address: accountEmail ?? `mailchimp:${audience.id}@${dc}`,
      display_name: loginName ?? audience.name,
      provider_oauth_access_token_encrypted: encrypt(accessToken),
      // Webhook URL secret (Mailchimp doesn't sign payloads — verification
      // is timing-safe compare against this stored value).
      resend_webhook_secret_encrypted: encrypt(webhookSecret),
      provider_metadata: {
        mailchimp: {
          dc,
          audience_id: audience.id,
          audience_name: audience.name,
          member_count: audience.memberCount,
          webhook_id: webhookId,
          webhook_error: webhookError,
          auth: "oauth",
          login_name: loginName,
        },
      },
      is_active: true,
      is_default: (count ?? 0) === 0 || !!priorConnection,
    })
    .select("id")
    .single();

  if (insertErr) {
    return redirectToSettings(
      req,
      `mailchimp_error=db_insert&detail=${encodeURIComponent(insertErr.message)}`,
      activeProfileId,
    );
  }

  // New connection persisted — auto-disconnect any prior one.
  if (priorConnection && priorConnection.id !== insertedRow?.id) {
    await disconnectPriorConnection(service, priorConnection);
  }

  // No cookie cleanup needed — state lives entirely in the signed JWT,
  // which is single-use by virtue of the 10-min expiry. Mailchimp won't
  // reuse the same code anyway.
  //
  // Redirect to NEXT_PUBLIC_APP_URL-based settings, NOT req.url-based.
  // The callback runs on 127.0.0.1 (Mailchimp's required redirect host
  // for dev), but the user's Supabase session cookies live on localhost.
  // Sending them back to localhost ensures the connections list refreshes
  // with their session intact.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).replace(/\/+$/, "");
  // Land on the agent's profile Mail tab so the newly-connected
  // Mailchimp provider is visible right away with its green check.
  // Falls back to the profile list when no active profile (shouldn't
  // happen here since the persist step already required one).
  const path = activeProfileId
    ? `/apps/profile/${activeProfileId}?tab=mail&mailchimp=connected`
    : `/apps/profile?mailchimp=connected`;
  return NextResponse.redirect(`${appUrl}${path}`, 302);
}

function resolveRedirectUri(req: NextRequest): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const origin = base || req.nextUrl.origin?.replace(/\/+$/, "") || "";
  // Must match the same translation /start does — Mailchimp rejects
  // "localhost" in redirect URIs and the token-exchange compares strict.
  return (
    `${origin}/api/apps/hyperlocal/email-connections/mailchimp/oauth/callback`
  ).replace("://localhost", "://127.0.0.1");
}

function resolveWebhookUrl(req: NextRequest, secret: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const origin = base || req.nextUrl.origin?.replace(/\/+$/, "") || "";
  if (!origin) return null;
  return `${origin}/api/webhooks/mailchimp?secret=${encodeURIComponent(secret)}`;
}

function redirectToSettings(
  req: NextRequest,
  queryString: string,
  profileId: string | null = null,
): Response {
  // Same logic as the success path — always bounce to NEXT_PUBLIC_APP_URL
  // (localhost in dev), not to the 127.0.0.1-host the callback runs on.
  // Lands on the profile Mail tab when profileId is resolved; falls
  // back to the profile list (which has the same integration grid
  // accessible per-profile) for pre-state-verification errors where
  // we don't yet have a user id.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).replace(/\/+$/, "");
  const path = profileId
    ? `/apps/profile/${profileId}?tab=mail&${queryString}`
    : `/apps/profile?${queryString}`;
  return Response.redirect(`${appUrl}${path}`, 302);
}
