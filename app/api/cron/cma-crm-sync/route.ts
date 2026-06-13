import { NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cma-crm-sync
 *
 * Daily Vercel Cron — walks every active listing_studio CRM
 * connection and fires one cma/crm-sync.requested Inngest event per
 * connection so the past-client pool stays current. Catches stage
 * changes (e.g. an agent moves a contact to "Closed" in FUB) without
 * the agent having to click Sync now in the profile.
 *
 * Concurrency is enforced inside the Inngest function (cmaCrmSync has
 * concurrency: 2), so this route just fans out fire-and-forget. A
 * single failed enqueue doesn't take down the whole batch.
 *
 * Protected by CRON_SECRET — Vercel cron sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically when the
 * secret is set as a project env var.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredAt = new Date().toISOString();
  const service = createServiceRoleClient();

  // Only sync connections whose underlying platform row is active —
  // disabling on the profile side should stop these recurring syncs.
  const { data: rows, error } = await service
    .from("app_crm_connection_state")
    .select(
      `connection_id,
       platform_crm_connections!inner(id, user_id, is_active)`,
    )
    .eq("app", "listing_studio")
    .eq("platform_crm_connections.is_active", true);

  if (error) {
    console.error("[cron/cma-crm-sync] list query failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    connection_id: string;
    platform_crm_connections:
      | { user_id: string }
      | { user_id: string }[];
  };

  let enqueued = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Row[]) {
    const platform = Array.isArray(row.platform_crm_connections)
      ? row.platform_crm_connections[0]
      : row.platform_crm_connections;
    if (!platform?.user_id) continue;
    try {
      await inngest.send({
        name: "cma/crm-sync.requested",
        data: { userId: platform.user_id, connectionId: row.connection_id },
      });
      enqueued += 1;
    } catch (e) {
      failed += 1;
      console.error(
        "[cron/cma-crm-sync] inngest.send failed:",
        row.connection_id,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return Response.json({ ok: true, triggeredAt, enqueued, failed });
}
