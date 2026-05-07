import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { blogPipeline } from "@/lib/inngest/functions/blog-pipeline";
import { radarCheck } from "@/lib/inngest/functions/radar-check";
import { radarAudit } from "@/lib/inngest/functions/radar-audit";
import { radarCleanup } from "@/lib/inngest/functions/radar-cleanup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [blogPipeline, radarCheck, radarAudit, radarCleanup],
});
