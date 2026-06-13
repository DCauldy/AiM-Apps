import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runCmaCrmSync } from "@/lib/listing-studio/crm/sync";

// ---------------------------------------------------------------------------
// Event shape — fired by the profile-level multi-app CRM connect POST
// whenever a fresh connection lands with listing_studio in apps[].
// ---------------------------------------------------------------------------

type CmaCrmSyncEvent = {
  name: "cma/crm-sync.requested";
  data: {
    userId: string;
    /** platform_crm_connections.id */
    connectionId: string;
  };
};

// Concurrency cap of 2 keeps any one user's repeated reconnect attempts
// from monopolizing the worker — most CRM syncs finish in seconds, but
// a 25k-contact pull on a slow connector can run for minutes.
// Retries off because runCmaCrmSync already persists last_error onto
// app_crm_connection_state — retrying would mask the underlying problem.
export const cmaCrmSync = inngest.createFunction(
  {
    id: "cma-crm-sync",
    name: "CMA: CRM past-client sync",
    retries: 0,
    concurrency: [{ limit: 2 }],
    triggers: [{ event: "cma/crm-sync.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: CmaCrmSyncEvent["data"]; id?: string };
    step: any;
  }) => {
    const { userId, connectionId } = event.data;
    const supabase = createServiceRoleClient();

    const result = await step.run("run-sync", () =>
      runCmaCrmSync(supabase, { userId, connectionId }),
    );

    return {
      candidates_total: result.candidates_total,
      candidates_created: result.candidates_created,
      candidates_updated: result.candidates_updated,
    };
  },
);
