import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { getActiveProfile } from "@/lib/profiles/server";
import type { CmaCrmPlatform, PastClientSource } from "@/types/cma";

export const dynamic = "force-dynamic";

// Encrypted-credential columns are never returned to the client. The
// public projection here mirrors the GET-time shape in
// types/cma.ts (CmaCrmConnectionsListResponse).
const PUBLIC_FIELDS = `
  id, profile_id, platform, label, base_url,
  past_client_source, past_client_value,
  is_active, last_synced_at, last_error,
  created_at, updated_at
`;

const ALLOWED_PLATFORMS: ReadonlySet<CmaCrmPlatform> = new Set([
  "followupboss",
  "lofty",
  "sierra",
  "boldtrail",
]);
const ALLOWED_SOURCES: ReadonlySet<PastClientSource> = new Set([
  "tag",
  "stage",
  "all",
]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Scope to the active profile when the user has one. RLS already
  // restricts to user_id; profile filter is a UX concern (agents see
  // only the connections for the brand they're currently working in).
  const profile = await getActiveProfile(user.id);
  let query = supabase
    .from("cma_crm_connections")
    .select(PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (profile) query = query.eq("profile_id", profile.id);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connections: data ?? [] });
}

export async function POST(req: NextRequest) {
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
    platform,
    label,
    api_key,
    base_url,
    past_client_source,
    past_client_value,
  } = (body ?? {}) as {
    platform?: string;
    label?: string;
    api_key?: string;
    base_url?: string;
    past_client_source?: string;
    past_client_value?: string;
  };

  if (!platform || !ALLOWED_PLATFORMS.has(platform as CmaCrmPlatform)) {
    return Response.json(
      { error: "platform must be one of: followupboss, lofty, sierra, boldtrail" },
      { status: 400 },
    );
  }
  if (
    past_client_source !== undefined &&
    !ALLOWED_SOURCES.has(past_client_source as PastClientSource)
  ) {
    return Response.json(
      { error: "past_client_source must be one of: tag, stage, all" },
      { status: 400 },
    );
  }
  if (
    (past_client_source === "tag" || past_client_source === "stage") &&
    !past_client_value?.trim()
  ) {
    return Response.json(
      { error: "past_client_value is required when past_client_source is 'tag' or 'stage'" },
      { status: 400 },
    );
  }

  const profile = await getActiveProfile(user.id);

  const insert: Record<string, unknown> = {
    user_id: user.id,
    profile_id: profile?.id ?? null,
    platform,
    label: label ?? null,
    base_url: base_url ?? null,
    past_client_source: past_client_source ?? null,
    past_client_value: past_client_value?.trim() || null,
  };

  if (api_key && api_key.trim().length > 0) {
    insert.api_key_encrypted = encrypt(api_key.trim());
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("cma_crm_connections")
    .insert(insert)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}
