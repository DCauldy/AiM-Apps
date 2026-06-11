import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import type { PastClientSource } from "@/types/cma";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `
  id, profile_id, platform, label, base_url,
  past_client_source, past_client_value,
  is_active, last_synced_at, last_error,
  created_at, updated_at
`;

const ALLOWED_SOURCES: ReadonlySet<PastClientSource> = new Set([
  "tag",
  "stage",
  "all",
]);

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
  const {
    label,
    api_key,
    base_url,
    past_client_source,
    past_client_value,
    is_active,
  } = (body ?? {}) as {
    label?: string;
    api_key?: string;
    base_url?: string;
    past_client_source?: string;
    past_client_value?: string;
    is_active?: boolean;
  };

  if (
    past_client_source !== undefined &&
    past_client_source !== null &&
    !ALLOWED_SOURCES.has(past_client_source as PastClientSource)
  ) {
    return Response.json(
      { error: "past_client_source must be one of: tag, stage, all" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (label !== undefined) update.label = label;
  if (base_url !== undefined) update.base_url = base_url;
  if (past_client_source !== undefined)
    update.past_client_source = past_client_source;
  if (past_client_value !== undefined)
    update.past_client_value = past_client_value?.trim() || null;
  if (is_active !== undefined) update.is_active = is_active;
  if (api_key && api_key.trim().length > 0) {
    update.api_key_encrypted = encrypt(api_key.trim());
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("cma_crm_connections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}

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

  const { error } = await supabase
    .from("cma_crm_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
