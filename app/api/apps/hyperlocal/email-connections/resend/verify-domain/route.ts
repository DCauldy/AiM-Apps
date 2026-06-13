import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createAppEmailConnection,
  getAppEmailConnectionStateInternal,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import {
  deleteResendDomain,
  getOrCreateResendDomain,
} from "@/lib/hyperlocal/email/providers/resend";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/resend/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * BYO Resend: user supplies their own API key. We validate it by calling
 * Resend's domains.create — or, when the domain is already registered on the
 * user's Resend account, by reading the existing domain instead. Either way
 * we end up with a domain id + DNS record snapshot to persist.
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

  // Scope this connection to the user's active profile so the gate +
  // dashboard's profile-scoped queries count it. Required since the
  // multi-profile refactor.
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

  // One sending connection per profile. Stash any existing connection
  // (different provider) so we can disconnect it AFTER the new one is
  // verified + persisted — never strand the agent with nothing connected
  // if the new setup fails partway. UI gates this with a confirm modal.
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
    // getPlatformEmailConnection wants the auth blobs too — fetch
    // separately so disconnect has the API key to clean up provider-side.
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

  const isActive = resendInfo.status === "verified";
  try {
    const connection = await createAppEmailConnection(service, "hyperlocal", {
      userId: user.id,
      profileId: profile.id,
      provider: "resend",
      emailAddress: fromEmail,
      displayName,
      resendApiKey: apiKey,
      resendDomain: domain,
      resendDomainId: resendInfo.resend_domain_id,
      resendDkimStatus: isActive ? "verified" : "pending",
      isActive,
      isDefault: existing.length === 0 && isActive,
    });

    // New connection persisted — now disconnect the prior one (one sending
    // connection per profile). Best-effort: failure here doesn't roll back
    // the new connection (user explicitly asked to replace).
    if (priorRef && priorRef.id !== connection.connection.id) {
      await disconnectPriorConnection(service, priorRef);
    }

    return Response.json({
      connection: connection.connection,
      dns_records: resendInfo.records,
      status: resendInfo.status,
      reused: resendInfo.reused ?? false,
      replaced: priorRef?.provider ?? null,
    });
  } catch (e) {
    // Roll back the Resend-side create so a retry isn't stuck on a duplicate.
    // Never delete a domain we reused — that would yank an already-verified
    // sending domain out from under the user.
    if (!resendInfo.reused) {
      try {
        await deleteResendDomain(apiKey, resendInfo.resend_domain_id);
      } catch {
        // Best-effort; getOrCreate will handle the leftover on next attempt.
      }
    }
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to persist connection",
      },
      { status: 500 },
    );
  }
}
