import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { blogPipeline } from "@/lib/inngest/functions/blog-pipeline";
import { topicsDiscover } from "@/lib/inngest/functions/topics-discover";
import { hlDiscover } from "@/lib/inngest/functions/hl-discover";
import { hlGenerate } from "@/lib/inngest/functions/hl-generate";
import { hlSend } from "@/lib/inngest/functions/hl-send";
import { hlSendOne } from "@/lib/inngest/functions/hl-send-one";
// cma-cadence-tick migrated to Trigger.dev (schedules.task) — see triggers/cma-cadence-tick.ts.
// cma-crm-sync migrated to Trigger.dev — see triggers/cma-crm-sync.ts.
// cma-deliver migrated to Trigger.dev — see triggers/cma-deliver.ts.
// radar-check / radar-audit / radar-cleanup migrated to Trigger.dev — see triggers/radar.ts.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    blogPipeline,
    topicsDiscover,
    hlDiscover,
    hlGenerate,
    hlSend,
    hlSendOne,
  ],
});
