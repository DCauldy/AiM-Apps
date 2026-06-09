import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import {
  getBofuUsage,
  reserveBlogSlot,
  refundBlogSlot,
} from "@/lib/blog-engine/usage";
import { runBlogPipeline } from "@/lib/blog-engine/run-pipeline";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV === "development";

/**
 * POST /api/apps/blog-engine/runs
 * Trigger a manual blog pipeline run.
 * In development mode, runs the pipeline directly (no Inngest dependency).
 * In production, sends an event to Inngest for background processing.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { topicId } = body;

    // Atomic check-and-reserve. Two concurrent POSTs can no longer both
    // pass the cap — the RPC serializes via SELECT … FOR UPDATE. If the
    // pipeline later fails we refund the slot below / in the catch path.
    const reservation = await reserveBlogSlot(user.id);
    if (!reservation.reserved) {
      const { data: schedule } = await supabase
        .from("bofu_schedules")
        .select("frequency_tier, stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const usage = await getBofuUsage(user.id);
      return Response.json(
        {
          error: "usage_limit_reached",
          usage,
          upgradeAvailable: !schedule?.stripe_subscription_id,
          currentTier: schedule?.frequency_tier || "free",
        },
        { status: 429 },
      );
    }

    if (isDev) {
      // Dev mode: run pipeline directly in background, return immediately.
      // Refund the reserved slot if the pipeline blows up.
      runBlogPipeline({
        userId: user.id,
        triggeredBy: "manual",
        topicId,
        runId: `dev-${Date.now()}`,
      }).catch(async (err) => {
        console.error("[Blog Engine] Pipeline failed:", err);
        await refundBlogSlot(user.id, !!reservation.used_bonus);
      });

      return Response.json({ success: true, message: "Pipeline started (dev mode)" });
    }

    // Production: hand off to Inngest with the reservation metadata so
    // the pipeline's catch path can refund if needed.
    await inngest.send({
      name: "blog-engine/run.requested",
      data: {
        userId: user.id,
        triggeredBy: "manual",
        topicId,
        slotPreReserved: true,
        usedBonus: !!reservation.used_bonus,
      },
    });

    return Response.json({ success: true, message: "Pipeline started" });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/apps/blog-engine/runs
 * List recent discovery runs.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: runs } = await supabase
      .from("bofu_discovery_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return Response.json({ runs: runs || [] });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
