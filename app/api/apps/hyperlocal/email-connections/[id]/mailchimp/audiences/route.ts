import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  mcAuthFromConnection,
  mcRequest,
} from "@/lib/hyperlocal/email/providers/mailchimp-client";
import type { HlEmailConnection } from "@/types/hyperlocal";
import { NextRequest } from "next/server";

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
  const { data: conn } = await service
    .from("hl_email_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("provider", "mailchimp")
    .maybeSingle();
  if (!conn) {
    return Response.json({ error: "Mailchimp connection not found" }, { status: 404 });
  }

  let audiences;
  try {
    const auth = mcAuthFromConnection(conn as HlEmailConnection);
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

  const meta = (conn.provider_metadata ?? {}) as {
    mailchimp?: { audience_id?: string };
  };

  return Response.json({
    audiences,
    selected_audience_id: meta.mailchimp?.audience_id ?? null,
  });
}
