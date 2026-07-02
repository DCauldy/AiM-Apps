import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/apps/heat/share
 *
 * Records a share + mints a tracked Request-a-Showing link, then returns
 * ready-to-open sms:/mailto: deep links so the agent sends from their own
 * device/inbox (no SMS provider, no email connection needed for v1).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    zpid?: string;
    listing?: Record<string, unknown>;
    contact?: { name?: string; email?: string; phone?: string };
    channel?: "email" | "text";
    audience?: "buyer" | "listing";
    message?: string;
    subject?: string;
  } | null;

  const channel = body?.channel === "text" ? "text" : "email";
  const note = (body?.message ?? "").trim();
  if (!note) return Response.json({ error: "Message is empty." }, { status: 400 });
  if (channel === "text" && !body?.contact?.phone) {
    return Response.json({ error: "A phone number is required to text." }, { status: 400 });
  }
  if (channel === "email" && !body?.contact?.email) {
    return Response.json({ error: "An email is required." }, { status: 400 });
  }

  const token = randomUUID().replace(/-/g, "").slice(0, 12);

  const { error } = await supabase.from("heat_shares").insert({
    user_id: user.id,
    token,
    zpid: body?.zpid ?? null,
    listing: body?.listing ?? null,
    contact_name: body?.contact?.name ?? null,
    contact_email: body?.contact?.email ?? null,
    contact_phone: body?.contact?.phone ?? null,
    channel,
    audience: body?.audience === "listing" ? "listing" : "buyer",
    message: note,
    status: "sent",
  });
  if (error) {
    console.error("heat share insert failed:", error);
    return Response.json({ error: "Couldn't create the share." }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const shareUrl = `${base}/showing/${token}`;
  const fullText = `${note} ${shareUrl}`;

  const sms =
    channel === "text"
      ? `sms:${body?.contact?.phone ?? ""}?&body=${encodeURIComponent(fullText)}`
      : null;
  const mailto =
    channel === "email"
      ? `mailto:${body?.contact?.email ?? ""}?subject=${encodeURIComponent(
          body?.subject ?? "A listing I thought of you for",
        )}&body=${encodeURIComponent(fullText)}`
      : null;

  return Response.json({ token, shareUrl, sms, mailto });
}
