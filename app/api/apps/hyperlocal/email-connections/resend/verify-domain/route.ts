import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { createResendDomain } from "@/lib/hyperlocal/email/providers/resend";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/resend/verify-domain
 * Body: { api_key, domain, from_email, display_name? }
 *
 * BYO Resend: user supplies their own API key. We validate it by calling
 * Resend's domains.create, then encrypt + persist on the connection.
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
    resendInfo = await createResendDomain(apiKey, domain);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Resend domain creation failed" },
      { status: 500 }
    );
  }

  const service = createServiceRoleClient();
  const { count } = await service
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: row, error } = await service
    .from("hl_email_connections")
    .insert({
      user_id: user.id,
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

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    connection: row,
    dns_records: resendInfo.records,
    status: resendInfo.status,
  });
}
