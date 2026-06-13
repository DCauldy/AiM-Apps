import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  acAuthFromConnection,
  acListSubscriberCount,
  acV3,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
} from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/email-connections/:id/activecampaign/lists
 *
 * Returns every list on the connected ActiveCampaign account so the
 * agent can switch which one Hyperlocal targets. Member counts come
 * back as strings from AC's API — we coerce to number.
 */
export async function GET(
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
  const conn = await getPlatformEmailConnection(service, user.id, id);
  if (!conn || conn.provider !== "activecampaign") {
    return Response.json(
      { error: "ActiveCampaign connection not found" },
      { status: 404 },
    );
  }
  const state = await getAppEmailConnectionStateInternal(service, "hyperlocal", id);
  const metadata = (state?.provider_metadata ?? {}) as HlEmailAppMetadata;

  let lists;
  try {
    const auth = acAuthFromConnection(conn, metadata);
    const data = await acV3<{
      lists: Array<{ id: string; name: string }>;
    }>(auth, "GET", "/lists?limit=100");
    // AC's /lists endpoint doesn't return subscriber counts — fetch each
    // via /contactLists in parallel. N+1 is fine here since most agents
    // have a single-digit number of lists.
    lists = await Promise.all(
      (data.lists ?? []).map(async (l) => ({
        id: l.id,
        name: l.name,
        member_count: await acListSubscriberCount(auth, l.id),
      })),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list lists" },
      { status: 500 },
    );
  }

  const selectedListId = metadata.activecampaign?.list_id ?? null;

  return Response.json({
    lists,
    selected_list_id: selectedListId != null ? String(selectedListId) : null,
  });
}
