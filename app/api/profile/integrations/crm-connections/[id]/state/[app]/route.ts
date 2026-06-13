import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { updateAppCrmConnection } from "@/lib/platform/connections";
import type {
  AppSlug,
  CmaCrmFilterConfig,
  HlCrmFilterConfig,
} from "@/types/platform-connections";

export const dynamic = "force-dynamic";

const ALLOWED_APPS: ReadonlySet<AppSlug> = new Set([
  "hyperlocal",
  "listing_studio",
]);

/**
 * PATCH /api/profile/integrations/crm-connections/[id]/state/[app]
 *
 * Updates a single app's filter_config on the connection. Body shape is
 * app-specific (CmaCrmFilterConfig for "listing_studio", HlCrmFilterConfig
 * for "hyperlocal") — caller passes a `filter_config` object that
 * matches the target app's schema.
 *
 * Powers the inline per-app filter editor on the profile CRM tab.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; app: string }> },
) {
  const { id, app } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!ALLOWED_APPS.has(app as AppSlug)) {
    return Response.json(
      { error: "app must be one of: hyperlocal, listing_studio" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const filterConfig = (body as { filter_config?: unknown }).filter_config;
  if (!filterConfig || typeof filterConfig !== "object") {
    return Response.json(
      { error: "filter_config object is required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const slug = app as AppSlug;

  // updateAppCrmConnection is generic over the app discriminator. Cast
  // the filter once per branch so the helper picks the right shape.
  const result =
    slug === "hyperlocal"
      ? await updateAppCrmConnection(service, user.id, "hyperlocal", id, {
          filterConfig: filterConfig as HlCrmFilterConfig,
        })
      : await updateAppCrmConnection(service, user.id, "listing_studio", id, {
          filterConfig: filterConfig as CmaCrmFilterConfig,
        });

  if (!result) {
    return Response.json(
      { error: "Connection not found or not wired into this app" },
      { status: 404 },
    );
  }
  return Response.json({ connection: result });
}
