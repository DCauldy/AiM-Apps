import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { blogPipeline } from "@/lib/inngest/functions/blog-pipeline";
import { topicsDiscover } from "@/lib/inngest/functions/topics-discover";
// cma-cadence-tick migrated to Trigger.dev (schedules.task) — see triggers/cma-cadence-tick.ts.
// cma-crm-sync migrated to Trigger.dev — see triggers/cma-crm-sync.ts.
// cma-deliver migrated to Trigger.dev — see triggers/cma-deliver.ts.
// radar-check / radar-audit / radar-cleanup migrated to Trigger.dev — see triggers/radar.ts.
// hl-discover / hl-generate migrated to Trigger.dev — see triggers/hyperlocal-pipeline.ts.
// hl-send / hl-send-one migrated to Trigger.dev — see triggers/hyperlocal-send.ts.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    blogPipeline,
    topicsDiscover,
  ],
});
