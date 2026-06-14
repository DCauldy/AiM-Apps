import { logger, metadata, schedules, task } from "@trigger.dev/sdk/v3";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runCmaCrmSync } from "@/lib/listing-studio/crm/sync";

// ============================================================
// CMA CRM past-client sync — per-connection sync + daily fan-out.
//
// Two tasks live together so the file maps 1:1 to the feature:
//
//   cmaCrmSyncTask         — pull past-client candidates from ONE
//                            CRM connection, upsert into cma_clients.
//                            Triggered (a) on-demand when an agent
//                            connects/edits a CRM via the profile
//                            integrations route, and (b) by the
//                            daily fan-out below.
//
//   cmaCrmSyncTickTask     — daily schedules.task that walks every
//                            active listing_studio CRM connection
//                            and batchTriggers cmaCrmSyncTask for
//                            each. Replaces the Vercel cron +
//                            /api/cron/cma-crm-sync HTTP wrapper.
//
// Retries off because runCmaCrmSync already persists last_error
// onto app_crm_connection_state — auto-retry would mask the real
// CRM-side problem (bad API key, rate limit, etc.).
// ============================================================

interface CmaCrmSyncPayload {
  userId: string;
  /** platform_crm_connections.id */
  connectionId: string;
}

export const cmaCrmSyncTask = task({
  id: "cma-crm-sync",
  queue: {
    name: "cma-crm-sync",
    concurrencyLimit: 2,
  },
  retry: { maxAttempts: 1 },
  maxDuration: 10 * 60,
  run: async (payload: CmaCrmSyncPayload, { ctx }) => {
    metadata.set("product", "listing-studio");
    metadata.set("userId", payload.userId);
    metadata.set("connectionId", payload.connectionId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "syncing");

    logger.log("CMA CRM sync starting", {
      userId: payload.userId,
      connectionId: payload.connectionId,
    });

    const supabase = createServiceRoleClient();
    const result = await runCmaCrmSync(supabase, {
      userId: payload.userId,
      connectionId: payload.connectionId,
    });

    metadata.set("step", "completed");
    metadata.set("candidatesTotal", result.candidates_total);
    metadata.set("candidatesCreated", result.candidates_created);
    metadata.set("candidatesUpdated", result.candidates_updated);
    await metadata.flush();

    logger.log("CMA CRM sync finished", {
      connectionId: payload.connectionId,
      candidates_total: result.candidates_total,
      candidates_created: result.candidates_created,
      candidates_updated: result.candidates_updated,
    });

    return {
      candidates_total: result.candidates_total,
      candidates_created: result.candidates_created,
      candidates_updated: result.candidates_updated,
    };
  },
});

// ---------------------------------------------------------------------------
// Daily fan-out schedule (replaces Vercel cron + /api/cron/cma-crm-sync)
// ---------------------------------------------------------------------------

export const cmaCrmSyncTickTask = schedules.task({
  id: "cma-crm-sync-tick",
  // 05:15 UTC daily — quiet window, well after the hourly cadence
  // tick at :00 so we never stomp on its enqueue burst.
  cron: "15 5 * * *",
  queue: {
    name: "cma-crm-sync-tick",
    concurrencyLimit: 1,
  },
  maxDuration: 5 * 60,
  run: async (payload, { ctx }) => {
    metadata.set("product", "listing-studio");
    metadata.set("scheduledAt", payload.timestamp.toISOString());
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "listing");

    const supabase = createServiceRoleClient();

    // Only sync connections whose underlying platform row is active —
    // disabling on the profile side should stop these recurring syncs.
    const { data: rows, error } = await supabase
      .from("app_crm_connection_state")
      .select(
        `connection_id,
         platform_crm_connections!inner(id, user_id, is_active)`,
      )
      .eq("app", "listing_studio")
      .eq("platform_crm_connections.is_active", true);

    if (error) {
      logger.error("CMA CRM sync tick: list query failed", {
        message: error.message,
      });
      throw new Error(`cma-crm-sync-tick query: ${error.message}`);
    }

    type Row = {
      connection_id: string;
      platform_crm_connections:
        | { user_id: string }
        | { user_id: string }[];
    };

    const items: Array<{
      payload: CmaCrmSyncPayload;
      options?: { tags?: string[] };
    }> = [];
    for (const row of (rows ?? []) as Row[]) {
      const platform = Array.isArray(row.platform_crm_connections)
        ? row.platform_crm_connections[0]
        : row.platform_crm_connections;
      if (!platform?.user_id) continue;
      items.push({
        payload: {
          userId: platform.user_id,
          connectionId: row.connection_id,
        },
        options: {
          tags: [
            `cma-crm-connection:${row.connection_id}`,
            "cma-crm-sync:daily",
          ],
        },
      });
    }

    metadata.set("step", "enqueueing");
    metadata.set("connectionCount", items.length);

    if (items.length > 0) {
      await cmaCrmSyncTask.batchTrigger(items);
    }

    metadata.set("step", "completed");
    metadata.set("enqueued", items.length);
    await metadata.flush();

    logger.log("CMA CRM sync tick finished", { enqueued: items.length });
    return { enqueued: items.length };
  },
});
