import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Encrypted credential columns are deliberately NOT here — those are
// secret. `resend_webhook_secret_encrypted` IS pulled so we can reshape
// it into a `webhook_secret_set` boolean. `provider_metadata` is exposed
// because campaign-mode panels read list/audience ids from it.
const PUBLIC_FIELDS = `id, provider, email_address, display_name, is_active, is_default, paused, paused_reason, paused_at, resend_domain, resend_dkim_status, resend_webhook_secret_encrypted, provider_metadata, last_send_at, last_error, created_at, updated_at`;

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

  // Load the row scoped to the user (auth check), then hand off to the
  // shared disconnect helper. The helper runs provider-side cleanup
  // (Resend webhook, Mailchimp audience webhook, etc.) and deletes the
  // row via the service-role client — user-scoped deletes silently no-op
  // under RLS, which is what caused the "still connected after disconnect"
  // bug we hit before this refactor.
  const service = createServiceRoleClient();
  const { data: conn } = await service
    .from("hl_email_connections")
    .select(
      "id, provider, resend_webhook_id, resend_domain_id, resend_api_key_encrypted, provider_api_key_encrypted, provider_oauth_access_token_encrypted, provider_metadata",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    await disconnectPriorConnection(service, conn);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Disconnect failed — see server logs.",
      },
      { status: 500 },
    );
  }
  return Response.json({ success: true });
}
