import { createServiceRoleClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface ResendWebhookEvent {
  type: string;          // e.g. "email.bounced", "email.complained", "email.delivered"
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    bounce?: { type?: string };
  };
}

/**
 * POST /api/webhooks/resend
 * Resend webhook for bounce + complaint events.
 *
 * We look up the recipient by provider_message_id (Resend's email_id), then
 * suppress the email + mark the recipient bounced/complained.
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient();

  let payload: ResendWebhookEvent;
  try {
    payload = (await req.json()) as ResendWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type ?? "";
  const messageId = payload.data?.email_id;
  if (!messageId) {
    return Response.json({ ok: true, ignored: "no email_id" });
  }

  // Find the recipient row via provider_message_id
  const { data: recipient } = await supabase
    .from("hl_recipients")
    .select(
      "id, contact_email, email_id, hl_emails!inner(run_id, hl_runs!inner(user_id))"
    )
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (!recipient) {
    return Response.json({ ok: true, ignored: "recipient not found" });
  }

  const userId =
    (recipient as unknown as {
      hl_emails: { hl_runs: { user_id: string } };
    }).hl_emails.hl_runs.user_id;

  if (eventType === "email.bounced") {
    await supabase
      .from("hl_recipients")
      .update({
        send_status: "bounced",
        error_message: payload.data?.bounce?.type ?? "bounced",
      })
      .eq("id", recipient.id);
    await addSuppression({
      userId,
      email: recipient.contact_email,
      reason: "bounced",
    });
  } else if (eventType === "email.complained") {
    await supabase
      .from("hl_recipients")
      .update({
        send_status: "complained",
        error_message: "spam complaint",
      })
      .eq("id", recipient.id);
    await addSuppression({
      userId,
      email: recipient.contact_email,
      reason: "complained",
    });
  } else if (eventType === "email.opened") {
    await supabase
      .from("hl_recipients")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", recipient.id);
  }

  return Response.json({ ok: true });
}
