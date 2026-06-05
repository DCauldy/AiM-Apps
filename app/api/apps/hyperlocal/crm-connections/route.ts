import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { NextRequest } from "next/server";
import type { CrmPlatform } from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

// Strip secret fields from the response — clients never need to see encrypted blobs.
const PUBLIC_FIELDS = `id, platform, label, base_url, column_mapping, search_area_source, search_area_column, search_area_tag_pattern, is_active, last_synced_at, last_error, created_at, updated_at`;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hl_crm_connections")
    .select(PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connections: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    platform,
    label,
    api_key,
    base_url,
    column_mapping,
    search_area_source,
    search_area_column,
    search_area_tag_pattern,
  } = body as {
    platform?: CrmPlatform;
    label?: string;
    api_key?: string;
    base_url?: string;
    column_mapping?: Record<string, unknown>;
    search_area_source?: string;
    search_area_column?: string;
    search_area_tag_pattern?: string;
  };

  if (!platform) {
    return Response.json({ error: "platform is required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    user_id: user.id,
    platform,
    label,
    base_url,
    column_mapping,
    search_area_source: search_area_source ?? "none",
    search_area_column,
    search_area_tag_pattern,
  };

  // Encrypt the API key if provided (FUB, Lofty, etc.)
  if (api_key && typeof api_key === "string" && api_key.trim().length > 0) {
    insert.api_key_encrypted = encrypt(api_key.trim());
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("hl_crm_connections")
    .insert(insert)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}
