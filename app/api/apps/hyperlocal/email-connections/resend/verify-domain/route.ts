import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import {
  deleteResendDomain,
  getOrCreateResendDomain,
} from "@/lib/hyperlocal/email/providers/resend";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
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
      { status: 400 }
    );
  }
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return Response.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (!fromEmail || !fromEmail.endsWith("@" + domain)) {
    return Response.json(
      { error: `from_email must be on the verified domain (${domain})` },
      { status: 400 }
    );
  }

  let resendInfo;
  try {
    resendInfo = await getOrCreateResendDomain(apiKey, domain);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Resend domain setup failed" },
      { status: 500 }
    );
  }

  const service = createServiceRoleClient();

  // Scope this connection to the user's active profile so the gate +
  // dashboard's profile-scoped queries count it. Required since the
  // multi-profile refactor.
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

  // One sending connection per profile. Stash any existing connection
  // (different provider) so we can disconnect it AFTER the new one is
  // verified + persisted — never strand the agent with nothing connected
  // if the new setup fails partway. UI gates this with a confirm modal.
  const { data: priorConnection } = await service
    .from("hl_email_connections")
    .select("id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_metadata")
    .eq("user_id", user.id)
    .eq("profile_id", profileMeta.active_profile_id)
    .limit(1)
    .maybeSingle();

  const { count } = await service
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profileMeta.active_profile_id);

  const { data: row, error } = await service
    .from("hl_email_connections")
    .insert({
      user_id: user.id,
      profile_id: profileMeta.active_profile_id,
      provider: "resend",
      email_address: fromEmail,
      display_name: displayName,
      resend_api_key_encrypted: encrypt(apiKey),
      resend_domain: domain,
      resend_domain_id: resendInfo.resend_domain_id,
      resend_dkim_status:
        resendInfo.status === "verified" ? "verified" : "pending",
      is_active: resendInfo.status === "verified",
      is_default: (count ?? 0) === 0 && resendInfo.status === "verified",
    })
    .select(
      "id, provider, email_address, display_name, is_active, is_default, resend_domain, resend_dkim_status, created_at"
    )
    .single();

  if (error) {
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
    return Response.json({ error: error.message }, { status: 500 });
  }

  // New connection persisted — now disconnect the prior one (one sending
  // connection per profile). Best-effort: failure here doesn't roll back
  // the new connection (user explicitly asked to replace).
  if (priorConnection && priorConnection.id !== row.id) {
    await disconnectPriorConnection(service, priorConnection);
  }

  return Response.json({
    connection: row,
    dns_records: resendInfo.records,
    status: resendInfo.status,
    reused: resendInfo.reused ?? false,
    replaced: priorConnection?.provider ?? null,
  });
}
