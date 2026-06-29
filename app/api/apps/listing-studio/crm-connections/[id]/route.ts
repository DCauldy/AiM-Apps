import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deletePlatformCrmConnection,
  getAppCrmConnection,
  updateAppCrmConnection,
} from "@/lib/platform/connections";
import type { CmaCrmFilterConfig } from "@/types/platform-connections";
import type { PastClientSource } from "@/types/cma";

export const dynamic = "force-dynamic";

const ALLOWED_SOURCES: ReadonlySet<PastClientSource> = new Set([
  "tag",
  "stage",
  "all",
]);

/**
 * PATCH /api/apps/listing-studio/crm-connections/[id]
 *
 * Patches either the shared platform row (label, base_url, api_key,
 * is_active) or the per-app filter_config (past_client_source/value).
 * updateAppCrmConnection takes care of both in one call.
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
    label?: string | null;
    api_key?: string;
    base_url?: string | null;
    past_client_source?: string | null;
    past_client_value?: string | null;
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

  // Only include filter_config in the update when one of the filter
  // fields was actually sent — otherwise we'd overwrite the stored
  // config with a half-empty patch.
  let filterConfig: CmaCrmFilterConfig | undefined;
  if (past_client_source !== undefined || past_client_value !== undefined) {
    // Read the existing app-state row to preserve untouched fields.
    const service = createServiceRoleClient();
    const existing = await getAppCrmConnection(
      service,
      user.id,
      "listing_studio",
      id,
    );
    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const cur = existing.state.filter_config ?? {};
    filterConfig = {
      past_client_source:
        past_client_source === undefined
          ? (cur.past_client_source ?? null)
          : (past_client_source as PastClientSource | null),
      past_client_value:
        past_client_value === undefined
          ? (cur.past_client_value ?? null)
          : past_client_value?.trim() || null,
    };
  }

  const service = createServiceRoleClient();
  try {
    const connection = await updateAppCrmConnection(
      service,
      user.id,
      "listing_studio",
      id,
      {
        label: label ?? undefined,
        apiKey: api_key,
        baseUrl: base_url ?? undefined,
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
  await deletePlatformCrmConnection(service, user.id, id);
  return Response.json({ success: true });
}
