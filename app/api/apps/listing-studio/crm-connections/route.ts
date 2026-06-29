import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  createAppCrmConnection,
  listAppCrmConnections,
} from "@/lib/platform/connections";
import type { CmaCrmFilterConfig } from "@/types/platform-connections";
import type { CmaCrmPlatform, PastClientSource } from "@/types/cma";

export const dynamic = "force-dynamic";

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

/**
 * GET /api/apps/listing-studio/crm-connections
 *
 * Returns the joined AppCrmConnection<"listing_studio">[] shape from
 * the shared platform_crm_connections + app_crm_connection_state
 * tables (Wave 9). Auth blobs are stripped server-side by the
 * helper.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Profile-scoped — each branded persona owns its own integrations.
  const profile = await getActiveProfile(user.id);

  const service = createServiceRoleClient();
  const connections = await listAppCrmConnections(
    service,
    user.id,
    profile?.id ?? null,
    "listing_studio",
  );
  return Response.json({ connections });
}

/**
 * POST /api/apps/listing-studio/crm-connections
 *
 * Create a new shared CRM connection + paired CMA app-state row.
 * Filter fields (past_client_source/value) live on app_state.filter_config.
 */
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

  // profile_id is NOT NULL on platform_crm_connections — refuse the
  // create rather than silently lose the scoping when there's no
  // active profile.
  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "An active profile is required to add a CRM connection." },
      { status: 400 },
    );
  }

  const filterConfig: CmaCrmFilterConfig = {
    past_client_source: (past_client_source as PastClientSource | undefined) ?? null,
    past_client_value: past_client_value?.trim() || null,
  };

  const service = createServiceRoleClient();
  try {
    const connection = await createAppCrmConnection(service, "listing_studio", {
      userId: user.id,
      profileId: profile.id,
      platform: platform as CmaCrmPlatform,
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
