import "server-only";

import { Resend } from "resend";

import { decrypt } from "@/lib/hyperlocal/encryption";
import { escapeHtml, renderBrandedEmail } from "@/lib/platform/email/branded-template";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ============================================================
// Showing-request notification — how the AGENT knows, instantly:
//   1. Email to the agent's account inbox (platform Resend sender)
//   2. A note on the contact in their CRM (FUB), where they work
// Both are best-effort and independent; neither blocks the client's
// confirmation. (In-app activity feed + SMS/push are future channels.)
// ============================================================

interface ShareRow {
  user_id: string;
  token: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  listing: Record<string, unknown> | null;
  showing_name: string | null;
  showing_phone: string | null;
  showing_note: string | null;
}

async function fubFindPersonId(auth: string, email: string | null, phone: string | null): Promise<number | null> {
  const tryParam = async (param: "email" | "phone", value: string) => {
    const url = new URL("https://api.followupboss.com/v1/people");
    url.searchParams.set(param, value);
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const data = (await res.json().catch(() => null)) as { people?: { id?: number }[] } | null;
    return data?.people?.[0]?.id ?? null;
  };
  if (email) {
    const id = await tryParam("email", email);
    if (id) return id;
  }
  if (phone) return tryParam("phone", phone);
  return null;
}

async function writeCrmNote(service: ReturnType<typeof createServiceRoleClient>, share: ShareRow): Promise<boolean> {
  const { data: conn } = await service
    .from("platform_crm_connections")
    .select("api_key_encrypted")
    .eq("user_id", share.user_id)
    .eq("platform", "followupboss")
    .maybeSingle();
  if (!conn?.api_key_encrypted) return false;

  const auth = "Basic " + Buffer.from(decrypt(conn.api_key_encrypted) + ":").toString("base64");
  const personId = await fubFindPersonId(auth, share.contact_email, share.contact_phone);
  if (!personId) return false;

  const address = (share.listing?.address as string) ?? "a listing";
  const who = share.showing_name ?? share.contact_name ?? "A client";
  const body = [
    `${who} requested a showing for ${address} (shared via Heat).`,
    share.showing_note || null,
    share.showing_phone ? `Phone: ${share.showing_phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.followupboss.com/v1/notes", {
    method: "POST",
    headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ personId, subject: `Showing requested — ${address}`, body }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return Boolean(res?.ok);
}

async function emailAgent(service: ReturnType<typeof createServiceRoleClient>, share: ShareRow): Promise<boolean> {
  const key = process.env.PLATFORM_RESEND_API_KEY;
  if (!key) return false;

  const { data } = await service.auth.admin.getUserById(share.user_id);
  const agentEmail = data?.user?.email;
  if (!agentEmail) return false;

  const address = (share.listing?.address as string) ?? "a listing";
  const who = share.showing_name ?? share.contact_name ?? "A client";
  const rows = [
    `<p style="margin:0 0 6px"><strong>${escapeHtml(who)}</strong> wants to see <strong>${escapeHtml(address)}</strong>.</p>`,
    share.showing_note ? `<p style="margin:0 0 6px">${escapeHtml(share.showing_note)}</p>` : "",
    share.showing_phone ? `<p style="margin:0 0 6px">📞 ${escapeHtml(share.showing_phone)}</p>` : "",
  ].join("");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  const html = renderBrandedEmail({
    preheader: `${who} requested a showing for ${address}`,
    eyebrow: "Heat",
    title: "🔥 New showing request",
    body: rows,
    ctaLabel: "Open Heat",
    ctaUrl: `${appUrl}/apps/heat`,
  });

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: process.env.PLATFORM_RESEND_FROM ?? "AiM <noreply@aimarketingacademy.com>",
      to: agentEmail,
      subject: `🔥 Showing request — ${address}`,
      html,
    });
    return !result.error;
  } catch {
    return false;
  }
}

/** Fire both channels. Best-effort; never throws. */
export async function notifyShowingRequest(share: ShareRow): Promise<{ email: boolean; crm: boolean }> {
  const service = createServiceRoleClient();
  const [email, crm] = await Promise.all([
    emailAgent(service, share).catch(() => false),
    writeCrmNote(service, share).catch(() => false),
  ]);
  return { email, crm };
}
