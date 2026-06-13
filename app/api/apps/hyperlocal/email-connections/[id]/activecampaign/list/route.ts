import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  acAuthFromConnection,
  acListSubscriberCount,
  acV3,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
  updateAppEmailState,
} from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/hyperlocal/email-connections/:id/activecampaign/list
 * Body: { list_id }
 *
 * Switch which AC list this connection targets. Validates the list
 * still exists on the account, then updates provider_metadata. No
 * webhook re-provisioning in Phase 1 (no webhooks yet).
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

  const body = await req.json().catch(() => ({}));
  const listId = String(body.list_id ?? "").trim();
  if (!listId) {
    return Response.json({ error: "list_id is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const conn = await getPlatformEmailConnection(service, user.id, id);
  if (!conn || conn.provider !== "activecampaign") {
    return Response.json(
      { error: "ActiveCampaign connection not found" },
      { status: 404 },
    );
  }
  const state = await getAppEmailConnectionStateInternal(service, "hyperlocal", id);
  const metadata = (state?.provider_metadata ?? {}) as HlEmailAppMetadata;

  let listName: string | null = null;
  let memberCount = 0;
  try {
    const auth = acAuthFromConnection(conn, metadata);
    const data = await acV3<{
      list?: { id: string; name: string };
    }>(auth, "GET", `/lists/${encodeURIComponent(listId)}`);
    if (!data.list) {
      return Response.json(
        { error: "That list doesn't exist on this AC account." },
        { status: 404 },
      );
    }
    listName = data.list.name;
    // Count active subscribers via /contactLists (the /lists endpoint
    // doesn't return counts directly).
    memberCount = await acListSubscriberCount(auth, listId);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "List lookup failed" },
      { status: 500 },
    );
  }

  const newMeta: HlEmailAppMetadata = {
    ...metadata,
    activecampaign: {
      ...(metadata.activecampaign ?? {}),
      list_id: Number(listId),
    },
  };

  try {
    await updateAppEmailState(service, user.id, "hyperlocal", id, {
      providerMetadata: newMeta,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to update connection metadata" },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    list: { id: listId, name: listName, member_count: memberCount },
  });
}
