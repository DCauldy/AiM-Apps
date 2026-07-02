import { NextRequest } from "next/server";

import { notifyShowingRequest } from "@/lib/heat/notify";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/public/heat-showing
 *
 * Public (no auth) — a client requesting a showing from a shared listing
 * link. Looked up by token; marks the share and captures their details so
 * the agent gets the lead. (CRM task write-back: follow-up phase.)
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    name?: string;
    phone?: string;
    note?: string;
  } | null;

  if (!body?.token || !body.name?.trim()) {
    return Response.json({ error: "Name is required." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: share } = await service
    .from("heat_shares")
    .select("id, user_id, token, contact_name, contact_email, contact_phone, listing")
    .eq("token", body.token)
    .maybeSingle();

  if (!share) return Response.json({ error: "Link not found." }, { status: 404 });

  const showing = {
    showing_name: body.name.trim(),
    showing_phone: body.phone?.trim() ?? null,
    showing_note: body.note?.trim() ?? null,
  };

  const { error } = await service
    .from("heat_shares")
    .update({
      status: "showing_requested",
      ...showing,
      showing_requested_at: new Date().toISOString(),
    })
    .eq("id", share.id);

  if (error) {
    console.error("heat showing request failed:", error);
    return Response.json({ error: "Couldn't submit. Try again." }, { status: 500 });
  }

  // Notify the agent instantly — email + CRM note. Best-effort.
  await notifyShowingRequest({
    user_id: share.user_id as string,
    token: share.token as string,
    contact_name: share.contact_name as string | null,
    contact_email: share.contact_email as string | null,
    contact_phone: share.contact_phone as string | null,
    listing: share.listing as Record<string, unknown> | null,
    ...showing,
  });

  return Response.json({ ok: true });
}
