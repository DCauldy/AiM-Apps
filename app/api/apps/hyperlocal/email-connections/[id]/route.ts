import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/hyperlocal/encryption";
import { deleteResendWebhook } from "@/lib/hyperlocal/email/providers/resend";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// `resend_webhook_secret_encrypted` deliberately NOT in PUBLIC_FIELDS — we
// reshape it into a `webhook_secret_set` boolean for the client.
const PUBLIC_FIELDS = `id, provider, email_address, display_name, is_active, is_default, paused, paused_reason, paused_at, resend_domain, resend_dkim_status, resend_webhook_secret_encrypted, last_send_at, last_error, created_at, updated_at`;

type RawRow = {
  resend_webhook_secret_encrypted: string | null;
  [k: string]: unknown;
};

function shapeRow(row: RawRow) {
  const { resend_webhook_secret_encrypted, ...rest } = row;
  return { ...rest, webhook_secret_set: !!resend_webhook_secret_encrypted };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.display_name === "string") update.display_name = body.display_name;
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;
  if (typeof body.is_default === "boolean") update.is_default = body.is_default;

  // Resend signing secret — agent gets this from their Resend webhook config.
  // Empty string clears it.
  if (typeof body.webhook_secret === "string") {
    const trimmed = body.webhook_secret.trim();
    update.resend_webhook_secret_encrypted = trimmed ? encrypt(trimmed) : null;
  }

  // Unpause path — agent has resolved the deliverability issue.
  if (body.paused === false) {
    update.paused = false;
    update.paused_reason = null;
    update.paused_at = null;
  }

  const service = createServiceRoleClient();

  // If setting default, clear other defaults first
  if (body.is_default === true) {
    await service
      .from("hl_email_connections")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await service
    .from("hl_email_connections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: shapeRow(data as RawRow) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Look up the Resend ids before deleting so we can tidy up the customer's
  // Resend account too — leftover webhooks accumulate and cause confusing
  // "why am I still getting events" questions later.
  const service = createServiceRoleClient();
  const { data: conn } = await service
    .from("hl_email_connections")
    .select("resend_api_key_encrypted, resend_webhook_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (conn?.resend_webhook_id && conn.resend_api_key_encrypted) {
    try {
      const apiKey = decrypt(conn.resend_api_key_encrypted);
      await deleteResendWebhook(apiKey, conn.resend_webhook_id);
    } catch {
      // Best-effort: don't block disconnect if Resend cleanup fails. The
      // worst case is an orphaned webhook in their dashboard.
    }
  }

  const { error } = await supabase
    .from("hl_email_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
