import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `id, platform, label, base_url, column_mapping, search_area_source, search_area_column, search_area_tag_pattern, is_active, last_synced_at, last_error, created_at, updated_at`;

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
  const {
    label,
    api_key,
    base_url,
    column_mapping,
    search_area_source,
    search_area_column,
    search_area_tag_pattern,
    is_active,
  } = body as {
    label?: string;
    api_key?: string;
    base_url?: string;
    column_mapping?: Record<string, unknown>;
    search_area_source?: string;
    search_area_column?: string;
    search_area_tag_pattern?: string;
    is_active?: boolean;
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (label !== undefined) update.label = label;
  if (base_url !== undefined) update.base_url = base_url;
  if (column_mapping !== undefined) update.column_mapping = column_mapping;
  if (search_area_source !== undefined)
    update.search_area_source = search_area_source;
  if (search_area_column !== undefined)
    update.search_area_column = search_area_column;
  if (search_area_tag_pattern !== undefined)
    update.search_area_tag_pattern = search_area_tag_pattern;
  if (is_active !== undefined) update.is_active = is_active;
  if (api_key && api_key.trim().length > 0) {
    update.api_key_encrypted = encrypt(api_key.trim());
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("hl_crm_connections")
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("hl_crm_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
