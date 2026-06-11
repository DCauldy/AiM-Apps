import { NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cma-tick
 *
 * Hourly Vercel Cron — fires the `cma/cadence.tick` Inngest event so
 * the cadence-tick fn runs in the background. Returns immediately;
 * the actual due-client scan + cma-deliver fan-out happens in
 * Inngest's worker, not the cron HTTP request.
 *
 * Protected by CRON_SECRET. The standard Vercel cron sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically when the
 * secret is set as a project env var.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredAt = new Date().toISOString();
  try {
    await inngest.send({
      name: "cma/cadence.tick",
      data: { triggeredAt },
    });
    return Response.json({ ok: true, triggeredAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/cma-tick]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
