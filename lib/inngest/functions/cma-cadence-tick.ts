import { tasks } from "@trigger.dev/sdk/v3";
import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { cmaDeliverTask } from "@/triggers/cma-deliver";

// ---------------------------------------------------------------------------
// CMA cadence tick — finds clients whose cadence has come due and
// fires a `cma/deliver.requested` event per row.
//
// Triggered hourly by Vercel cron → /api/cron/cma-tick → this
// function via `inngest.send`. Idempotent: clients whose next_due_at
// has passed get picked up on every tick until cma-deliver succeeds
// and bumps next_due_at forward. To prevent duplicate sends in the
// window between event-enqueue and delivery completion, we filter
// out clients with a delivery row created in the last 30 minutes.
//
// Bounded batch: at most 500 deliveries fired per tick. If more are
// due, the next hourly tick picks up the remainder. Keeps any
// single-tick burst within RapidAPI + ESP rate budgets.
// ---------------------------------------------------------------------------

const TICK_BATCH = 500;
const RECENT_DELIVERY_WINDOW_MIN = 30;

type CmaCadenceTickEvent = {
  name: "cma/cadence.tick";
  data: { triggeredAt?: string };
};

export const cmaCadenceTick = inngest.createFunction(
  {
    id: "cma-cadence-tick",
    name: "CMA: cadence tick",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ event: "cma/cadence.tick" }],
  },
  async ({
    step,
  }: {
    event: { data: CmaCadenceTickEvent["data"]; id?: string };
    step: any;
  }) => {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const recentWindow = new Date(
      Date.now() - RECENT_DELIVERY_WINDOW_MIN * 60 * 1000,
    ).toISOString();

    // 1. Find candidates — uses the cma_clients_due_idx partial index
    //    (enrolled = TRUE AND paused = FALSE AND unsubscribed_at IS NULL).
    const candidates: Array<{ id: string; user_id: string }> = await step.run(
      "find-due-clients",
      async () => {
        const { data, error } = await supabase
          .from("cma_clients")
          .select("id, user_id")
          .eq("enrolled", true)
          .eq("paused", false)
          .is("unsubscribed_at", null)
          .lte("next_due_at", now)
          .order("next_due_at", { ascending: true })
          .limit(TICK_BATCH);
        if (error) throw new Error(`cma-cadence-tick query: ${error.message}`);
        return data ?? [];
      },
    );

    if (candidates.length === 0) {
      return { fired: 0, skipped: 0 };
    }

    // 2. Skip clients whose previous delivery is still in-flight —
    //    a delivery row created in the last 30 min that hasn't yet
    //    written delivered_at means cma-deliver is still working it,
    //    so we don't want to fire a duplicate.
    const skipIds: string[] = await step.run("filter-in-flight", async () => {
      const { data } = await supabase
        .from("cma_client_deliveries")
        .select("client_id")
        .in(
          "client_id",
          candidates.map((c) => c.id),
        )
        .gte("created_at", recentWindow)
        .is("delivered_at", null);
      return (data ?? []).map((d: { client_id: string }) => d.client_id);
    });
    const skip = new Set(skipIds);

    const toFire = candidates.filter((c) => !skip.has(c.id));

    // 3. Enqueue Trigger.dev tasks — one per due client. Same-tick
    //    duplicate collapsing is handled by Trigger.dev's
    //    idempotencyKey: we key on (clientId, hour-bucket) so an
    //    operator hitting the cron URL twice within the hour produces
    //    one task per client, not two.
    if (toFire.length > 0) {
      await step.run("enqueue-deliveries", async () => {
        const hourBucket = now.slice(0, 13);
        await tasks.batchTrigger<typeof cmaDeliverTask>(
          "cma-deliver",
          toFire.map((c) => ({
            payload: {
              clientId: c.id,
              triggerSource: "cadence" as const,
            },
            options: {
              idempotencyKey: `cma-deliver-${c.id}-${hourBucket}`,
              idempotencyKeyTTL: "2h",
              tags: [`cma-client:${c.id}`, "cma-trigger:cadence"],
            },
          })),
        );
      });
    }

    return {
      fired: toFire.length,
      skipped: skip.size,
      candidates: candidates.length,
    };
  },
);
