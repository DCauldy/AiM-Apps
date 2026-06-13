import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { deletePlatformCrmConnection } from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `
  id, user_id, profile_id, platform, label, base_url,
  is_active, created_at, updated_at
`;

/**
 * PATCH /api/profile/integrations/crm-connections/[id]
 *
 * Patches the SHARED platform row only — label, base_url, api_key
 * rotation, is_active. App-specific filter config goes through each
 * app's own /api/apps/{app}/crm-connections/[id] route.
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
  const { label, base_url, api_key, is_active } = (body ?? {}) as {
    label?: string | null;
    base_url?: string | null;
    api_key?: string;
    is_active?: boolean;
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (label !== undefined) update.label = label;
  if (base_url !== undefined) update.base_url = base_url;
  if (is_active !== undefined) update.is_active = is_active;
  if (api_key && api_key.trim().length > 0) {
    update.api_key_encrypted = encrypt(api_key.trim());
  }

  if (Object.keys(update).length === 1) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_crm_connections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}

/**
 * DELETE /api/profile/integrations/crm-connections/[id]
 *
 * Drops the platform row + cascades all app_state rows. The agent is
 * confirming they want to remove the integration from EVERY app at
 * once. App-specific detach lives at /api/apps/{app}/crm-connections/[id].
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
  await deletePlatformCrmConnection(service, user.id, id);
  return Response.json({ success: true });
}
