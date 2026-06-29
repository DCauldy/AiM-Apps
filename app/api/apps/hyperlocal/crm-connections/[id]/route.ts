import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deletePlatformCrmConnection,
  getAppCrmConnection,
  updateAppCrmConnection,
} from "@/lib/platform/connections";
import { NextRequest } from "next/server";
import type {
  HlCrmFilterConfig,
} from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/hyperlocal/crm-connections/:id
 * Splits the body into platform-row fields (label, api_key, base_url, is_active)
 * and app_state fields (search_area_*, column_mapping → filter_config).
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
    column_mapping?: HlCrmFilterConfig["column_mapping"];
    search_area_source?: HlCrmFilterConfig["search_area_source"];
    search_area_column?: string;
    search_area_tag_pattern?: string;
    is_active?: boolean;
  };

  // Only build a filterConfig update when any filter-config field is touched.
  // We merge into the existing filter_config so partial PATCHes don't blow
  // away unrelated fields (e.g. updating only search_area_column shouldn't
  // clear column_mapping).
  let filterConfig: HlCrmFilterConfig | undefined;
  const filterFieldTouched =
    column_mapping !== undefined ||
    search_area_source !== undefined ||
    search_area_column !== undefined ||
    search_area_tag_pattern !== undefined;

  const service = createServiceRoleClient();
  if (filterFieldTouched) {
    const existing = await getAppCrmConnection(
      service,
      user.id,
      "hyperlocal",
      id,
    );
    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const prev = existing.state.filter_config;
    filterConfig = {
      search_area_source:
        search_area_source !== undefined
          ? search_area_source
          : prev.search_area_source ?? null,
      search_area_column:
        search_area_column !== undefined
          ? search_area_column
          : prev.search_area_column ?? null,
      search_area_tag_pattern:
        search_area_tag_pattern !== undefined
          ? search_area_tag_pattern
          : prev.search_area_tag_pattern ?? null,
      column_mapping:
        column_mapping !== undefined
          ? column_mapping
          : prev.column_mapping ?? null,
    };
  }

  try {
    const connection = await updateAppCrmConnection(
      service,
      user.id,
      "hyperlocal",
      id,
      {
        label: label,
        apiKey: api_key,
        baseUrl: base_url,
        isActive: is_active,
        filterConfig,
      },
    );
    if (!connection) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ connection });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/apps/hyperlocal/crm-connections/:id
 * Drops the platform_crm_connections row; app_state rows cascade.
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
  try {
    await deletePlatformCrmConnection(service, user.id, id);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
