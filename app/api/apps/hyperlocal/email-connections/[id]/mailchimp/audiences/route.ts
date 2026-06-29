import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  getAppEmailConnectionStateInternal,
  getPlatformEmailConnection,
} from "@/lib/platform/connections";
import {
  mcAuthFromConnection,
  mcRequest,
} from "@/lib/hyperlocal/email/providers/mailchimp-client";
import { NextRequest } from "next/server";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/email-connections/:id/mailchimp/audiences
 *
 * List every audience on the connected Mailchimp account so the agent
 * can switch which one Hyperlocal sends to. Returns name, member_count,
 * created_at — enough to render a picker.
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
  if (!conn || conn.provider !== "mailchimp") {
    return Response.json(
      { error: "Mailchimp connection not found" },
      { status: 404 },
    );
  }
  const state = await getAppEmailConnectionStateInternal(
    service,
    "hyperlocal",
    id,
  );
  if (!state || state.app !== "hyperlocal") {
    return Response.json(
      { error: "Hyperlocal state row missing for this connection" },
      { status: 404 },
    );
  }
  const metadata = state.provider_metadata as HlEmailAppMetadata;

  let audiences;
  try {
    const auth = mcAuthFromConnection(conn, metadata);
    const data = await mcRequest<{
      lists: Array<{
        id: string;
        name: string;
        stats?: { member_count?: number };
        date_created?: string;
      }>;
    }>(
      auth,
      "GET",
      "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count,lists.date_created",
    );
    audiences = (data.lists ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      member_count: l.stats?.member_count ?? null,
      date_created: l.date_created ?? null,
    }));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list audiences" },
      { status: 500 },
    );
  }

  return Response.json({
    audiences,
    selected_audience_id: metadata.mailchimp?.audience_id ?? null,
  });
}
