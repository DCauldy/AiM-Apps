import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  acAuthFromConnection,
  acListSubscriberCount,
  acV3,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import type { HlEmailConnection } from "@/types/hyperlocal";
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
  const { data: conn } = await service
    .from("hl_email_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("provider", "activecampaign")
    .maybeSingle();
  if (!conn) {
    return Response.json(
      { error: "ActiveCampaign connection not found" },
      { status: 404 },
    );
  }

  let listName: string | null = null;
  let memberCount = 0;
  try {
    const auth = acAuthFromConnection(conn as HlEmailConnection);
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

  const oldMeta = (conn.provider_metadata ?? {}) as {
    activecampaign?: Record<string, unknown>;
  };
  const newMeta = {
    ...oldMeta,
    activecampaign: {
      ...(oldMeta.activecampaign ?? {}),
      list_id: listId,
      list_name: listName,
      member_count: memberCount,
    },
  };

  const { error: updateError } = await service
    .from("hl_email_connections")
    .update({ provider_metadata: newMeta })
    .eq("id", id);
  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    list: { id: listId, name: listName, member_count: memberCount },
  });
}
