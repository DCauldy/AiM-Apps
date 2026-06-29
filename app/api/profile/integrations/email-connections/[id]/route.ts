import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { deletePlatformEmailConnection } from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `
  id, user_id, profile_id, provider, email_address, display_name,
  resend_domain, resend_domain_id, resend_dkim_status,
  is_active, created_at, updated_at
`;

/**
 * PATCH /api/profile/integrations/email-connections/[id]
 *
 * Patches the shared platform row — display_name, api_key rotation,
 * is_active. Per-app state (is_default, paused, webhook secret)
 * stays on each app's own /api/apps/{app}/email-connections/[id].
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { display_name, resend_api_key, provider_api_key, is_active } =
    (body ?? {}) as {
      display_name?: string | null;
      resend_api_key?: string;
      provider_api_key?: string;
      is_active?: boolean;
    };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (display_name !== undefined) update.display_name = display_name;
  if (is_active !== undefined) update.is_active = is_active;
  if (resend_api_key && resend_api_key.trim().length > 0) {
    update.resend_api_key_encrypted = encrypt(resend_api_key.trim());
  }
  if (provider_api_key && provider_api_key.trim().length > 0) {
    update.provider_api_key_encrypted = encrypt(provider_api_key.trim());
  }

  if (Object.keys(update).length === 1) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_email_connections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}

/**
 * DELETE /api/profile/integrations/email-connections/[id]
 *
 * Drops the platform row + cascades all app_state rows. Confirms the
 * agent wants to disconnect this domain from every app. App-specific
 * detach lives at /api/apps/{app}/email-connections/[id] (which
 * refuses to delete the default for that app).
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
  await deletePlatformEmailConnection(service, user.id, id);
  return Response.json({ success: true });
}
