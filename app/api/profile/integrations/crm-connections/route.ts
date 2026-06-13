import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import type {
  AppSlug,
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

/**
 * POST /api/profile/integrations/crm-connections
 *
 * Creation isn't supported here — the connect flow needs app context
 * (which filter the user wants configured + which app picks up the
 * webhook). To add a new connection, the agent goes to the relevant
 * app's settings.
 */
export async function POST(_req: NextRequest) {
  return Response.json(
    {
      error:
        "Profile-level creation isn't supported — connect a CRM from the app that will use it (Hyperlocal or CMA settings).",
    },
    { status: 501 },
  );
}
