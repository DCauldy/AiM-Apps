import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { blogPipeline } from "@/lib/inngest/functions/blog-pipeline";
import { topicsDiscover } from "@/lib/inngest/functions/topics-discover";
import { radarCheck } from "@/lib/inngest/functions/radar-check";
import { radarAudit } from "@/lib/inngest/functions/radar-audit";
import { radarCleanup } from "@/lib/inngest/functions/radar-cleanup";
import { hlDiscover } from "@/lib/inngest/functions/hl-discover";
import { hlGenerate } from "@/lib/inngest/functions/hl-generate";
import { hlSend } from "@/lib/inngest/functions/hl-send";
import { hlSendOne } from "@/lib/inngest/functions/hl-send-one";
import { cmaCrmSync } from "@/lib/inngest/functions/cma-crm-sync";
// cma-cadence-tick migrated to Trigger.dev (schedules.task) — see triggers/cma-cadence-tick.ts.
// cma-deliver migrated to Trigger.dev — see triggers/cma-deliver.ts.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    blogPipeline,
    topicsDiscover,
    radarCheck,
    radarAudit,
    radarCleanup,
    hlDiscover,
    hlGenerate,
    hlSend,
    hlSendOne,
    cmaCrmSync,
  ],
});
