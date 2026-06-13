import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createAppCrmConnection,
  listAppCrmConnections,
} from "@/lib/platform/connections";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest } from "next/server";
import type { CrmPlatform } from "@/types/hyperlocal";
import type { HlCrmFilterConfig } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/crm-connections
 * Returns all CRM connections for the active profile, with Hyperlocal-app
 * state joined in. Public projection — auth blobs stripped by the helper.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "No active profile — set one up before viewing connections" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const connections = await listAppCrmConnections(
    service,
    user.id,
    profile.id,
    "hyperlocal",
  );
  return Response.json({ connections });
}

/**
 * POST /api/apps/hyperlocal/crm-connections
 * Creates a paired platform_crm_connections + app_crm_connection_state row.
 * Hyperlocal-specific filter fields (search_area_*, column_mapping) end up
 * in filter_config; identity + auth fields go on the platform row.
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
      {
        error:
          "No active profile — set one up before connecting a CRM.",
      },
      { status: 400 },
    );
  }

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
    column_mapping?: HlCrmFilterConfig["column_mapping"];
    search_area_source?: HlCrmFilterConfig["search_area_source"];
    search_area_column?: string;
    search_area_tag_pattern?: string;
  };

  if (!platform) {
    return Response.json({ error: "platform is required" }, { status: 400 });
  }

  const filterConfig: HlCrmFilterConfig = {
    search_area_source: search_area_source ?? "none",
    search_area_column: search_area_column ?? null,
    search_area_tag_pattern: search_area_tag_pattern ?? null,
    column_mapping: column_mapping ?? null,
  };

  const service = createServiceRoleClient();
  try {
    const connection = await createAppCrmConnection(service, "hyperlocal", {
      userId: user.id,
      profileId: profile.id,
      platform,
      label: label ?? null,
      apiKey: api_key ?? null,
      baseUrl: base_url ?? null,
      filterConfig,
    });
    return Response.json({ connection });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to create connection" },
      { status: 500 },
    );
  }
}
