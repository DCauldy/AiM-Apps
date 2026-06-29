import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deletePlatformEmailConnection,
  getAppEmailConnectionStateInternal,
  getPlatformEmailConnection,
  updateAppEmailState,
} from "@/lib/platform/connections";
import { disconnectPriorConnection } from "@/lib/hyperlocal/email/disconnect";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/hyperlocal/email-connections/:id
 *
 * Updates fields on the per-app state (is_default, paused, webhook secret)
 * and/or the platform row (display_name, is_active). The is_default flip
 * demotes sibling defaults inside updateAppEmailState.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const service = createServiceRoleClient();

  // Platform-row update — display_name + is_active. Patch through the
  // service role directly since updateAppEmailState only writes platform
  // is_active; display_name lives on the same row but we still want to
  // honor PATCH semantics for it.
  if (typeof body.display_name === "string") {
    await service
      .from("platform_email_connections")
      .update({
        display_name: body.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  // App-state update — webhook secret, paused flag, is_default, is_active
  // gate. Empty string clears the webhook secret.
  const stateInput: Parameters<typeof updateAppEmailState<"hyperlocal">>[4] = {};
  if (typeof body.is_active === "boolean") stateInput.isActive = body.is_active;
  if (typeof body.is_default === "boolean") stateInput.isDefault = body.is_default;
  if (typeof body.webhook_secret === "string") {
    const trimmed = body.webhook_secret.trim();
    stateInput.webhookSecret = trimmed.length > 0 ? trimmed : null;
  }
  // Unpause — agent has resolved the deliverability issue.
  if (body.paused === false) {
    stateInput.paused = false;
    stateInput.pausedReason = null;
    stateInput.pausedAt = null;
  }

  const connection = await updateAppEmailState(
    service,
    user.id,
    "hyperlocal",
    id,
    stateInput,
  );
  if (!connection) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ connection });
}

/**
 * DELETE /api/apps/hyperlocal/email-connections/:id
 *
 * Hand off to the shared disconnect helper so provider-side cleanup
 * (Resend webhook removal, Mailchimp audience webhook removal, etc.)
 * fires before the platform row is dropped. We hydrate the prior
 * connection's per-app metadata + webhook id from app_state since
 * those moved off the platform row in Wave 9.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const conn = await getPlatformEmailConnection(service, user.id, id);
  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  const state = await getAppEmailConnectionStateInternal(
    service,
    "hyperlocal",
    id,
  );

  try {
    await disconnectPriorConnection(service, {
      id: conn.id,
      provider: conn.provider,
      // Resend webhook id is per-app — pull from the Hyperlocal state row.
      resend_webhook_id: state?.webhook_id ?? null,
      resend_domain_id: conn.resend_domain_id,
      resend_api_key_encrypted: conn.resend_api_key_encrypted,
      provider_api_key_encrypted: conn.provider_api_key_encrypted,
      provider_oauth_access_token_encrypted:
        conn.provider_oauth_access_token_encrypted,
      provider_metadata: (state?.provider_metadata ?? null) as Record<
        string,
        unknown
      > | null,
    });
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

  // Fall-through delete in case disconnectPriorConnection skipped its own
  // (it always tries, but kept defensive). No-op if the cascade already ran.
  await deletePlatformEmailConnection(service, user.id, id).catch(() => {});

  return Response.json({ success: true });
}
