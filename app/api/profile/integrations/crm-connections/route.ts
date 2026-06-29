import { NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import { getActiveProfile } from "@/lib/profiles/server";
import type { CrmPlatform } from "@/types/hyperlocal";
import type { cmaCrmSyncTask } from "@/triggers/cma-crm-sync";
import type {
  AppSlug,
  CmaCrmFilterConfig,
  HlCrmFilterConfig,
  PlatformCrmConnectionPublic,
} from "@/types/platform-connections";

export const dynamic = "force-dynamic";

const PLATFORM_CRM_PUBLIC = `
  id, user_id, profile_id, platform, label, base_url,
  is_active, created_at, updated_at
`;

interface AppStateSummary {
  app: AppSlug;
  state_id: string;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface ProfileCrmConnectionWithUsage {
  connection: PlatformCrmConnectionPublic;
  used_by: AppStateSummary[];
}

/**
 * GET /api/profile/integrations/crm-connections
 *
 * Returns the active profile's CRM connections joined to a summary of
 * which apps have wired them in. Powers the profile-level integrations
 * page where agents manage auth across all apps in one place.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) return Response.json({ connections: [] });

  const service = createServiceRoleClient();
  const { data: connRows, error } = await service
    .from("platform_crm_connections")
    .select(PLATFORM_CRM_PUBLIC)
    .eq("user_id", user.id)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const connections = (connRows ?? []) as PlatformCrmConnectionPublic[];
  if (connections.length === 0) return Response.json({ connections: [] });

  // Batched app_state lookup across every visible connection.
  const { data: stateRows } = await service
    .from("app_crm_connection_state")
    .select("id, connection_id, app, last_synced_at, last_error")
    .in(
      "connection_id",
      connections.map((c) => c.id),
    );

  const stateMap = new Map<string, AppStateSummary[]>();
  for (const row of (stateRows ?? []) as Array<{
    id: string;
    connection_id: string;
    app: AppSlug;
    last_synced_at: string | null;
    last_error: string | null;
  }>) {
    const arr = stateMap.get(row.connection_id) ?? [];
    arr.push({
      app: row.app,
      state_id: row.id,
      last_synced_at: row.last_synced_at,
      last_error: row.last_error,
    });
    stateMap.set(row.connection_id, arr);
  }

  const response: ProfileCrmConnectionWithUsage[] = connections.map((c) => ({
    connection: c,
    used_by: stateMap.get(c.id) ?? [],
  }));
  return Response.json({ connections: response });
}

const ALLOWED_PLATFORMS: ReadonlySet<CrmPlatform> = new Set([
  "followupboss",
  "lofty",
  "sierra",
  "boldtrail",
  "cinc",
  "cloze",
  "gohighlevel",
  "csv",
]);

const ALLOWED_APPS: ReadonlySet<AppSlug> = new Set([
  "hyperlocal",
  "listing_studio",
]);

interface PerAppFilterInput {
  app: AppSlug;
  filter_config: HlCrmFilterConfig | CmaCrmFilterConfig;
}

/**
 * POST /api/profile/integrations/crm-connections
 *
 * Creates ONE platform_crm_connection + one app_crm_connection_state
 * per selected app in a single round trip. The whole point of the
 * shared connection layer: one auth setup, multiple apps using it.
 *
 * Body:
 *   {
 *     platform: CrmPlatform,
 *     label?: string,
 *     api_key?: string,
 *     base_url?: string,
 *     apps: [
 *       { app: "listing_studio", filter_config: { past_client_source, past_client_value } },
 *       { app: "hyperlocal",    filter_config: { search_area_source, ... } },
 *     ]
 *   }
 *
 * At least one app is required — a connection with no app_state rows
 * is dead weight. Each app_state insert is independent; partial
 * failure rolls back the platform row.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "An active profile is required to add a CRM connection." },
      { status: 400 },
    );
  }

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
    apps,
  } = (body ?? {}) as {
    platform?: string;
    label?: string;
    api_key?: string;
    base_url?: string;
    apps?: PerAppFilterInput[];
  };

  if (!platform || !ALLOWED_PLATFORMS.has(platform as CrmPlatform)) {
    return Response.json(
      { error: `Invalid platform: ${platform}` },
      { status: 400 },
    );
  }
  if (!Array.isArray(apps) || apps.length === 0) {
    return Response.json(
      { error: "apps[] is required and must contain at least one entry" },
      { status: 400 },
    );
  }
  for (const a of apps) {
    if (!ALLOWED_APPS.has(a.app)) {
      return Response.json(
        { error: `Invalid app: ${a.app}` },
        { status: 400 },
      );
    }
    if (!a.filter_config || typeof a.filter_config !== "object") {
      return Response.json(
        { error: `filter_config required for ${a.app}` },
        { status: 400 },
      );
    }
  }

  const service = createServiceRoleClient();

  // 1. Create the platform row.
  const platformInsert: Record<string, unknown> = {
    user_id: user.id,
    profile_id: profile.id,
    platform,
    label: label?.trim() || null,
    base_url: base_url?.trim() || null,
  };
  if (api_key && api_key.trim().length > 0) {
    platformInsert.api_key_encrypted = encrypt(api_key.trim());
  }

  const { data: conn, error: connErr } = await service
    .from("platform_crm_connections")
    .insert(platformInsert)
    .select(PLATFORM_CRM_PUBLIC)
    .single();
  if (connErr || !conn) {
    return Response.json(
      { error: connErr?.message ?? "Failed to create connection" },
      { status: 500 },
    );
  }

  // 2. Create one app_state row per selected app. On any failure,
  //    roll back the platform row + any already-created states so a
  //    retry doesn't see half-attached orphans.
  const createdStateIds: string[] = [];
  for (const a of apps) {
    const { data: stateRow, error: stateErr } = await service
      .from("app_crm_connection_state")
      .insert({
        connection_id: (conn as PlatformCrmConnectionPublic).id,
        app: a.app,
        filter_config: a.filter_config as object,
      })
      .select("id")
      .single();
    if (stateErr || !stateRow) {
      // Roll back
      if (createdStateIds.length > 0) {
        await service
          .from("app_crm_connection_state")
          .delete()
          .in("id", createdStateIds);
      }
      await service
        .from("platform_crm_connections")
        .delete()
        .eq("id", (conn as PlatformCrmConnectionPublic).id);
      return Response.json(
        { error: `Failed to attach ${a.app}: ${stateErr?.message}` },
        { status: 500 },
      );
    }
    createdStateIds.push((stateRow as { id: string }).id);
  }

  // Auto-trigger the listing_studio past-client sync when CMA is among
  // the apps that just attached. Fires async via Trigger.dev so the
  // POST returns immediately — a 25k-contact pull would otherwise
  // blow past serverless timeouts. The dashboard empty state clears
  // as soon as the first batch lands in cma_clients.
  if (apps.some((a) => a.app === "listing_studio")) {
    try {
      await tasks.trigger<typeof cmaCrmSyncTask>("cma-crm-sync", {
        userId: user.id,
        connectionId: (conn as PlatformCrmConnectionPublic).id,
      });
    } catch (e) {
      // Don't fail the connect on an enqueue failure — the agent can
      // hit "Sync now" manually. Log so we notice if Trigger.dev
      // is unreachable.
      console.error(
        "[profile/crm-connections] tasks.trigger failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return Response.json({
    connection: conn,
    attached_apps: apps.map((a) => a.app),
  });
}
