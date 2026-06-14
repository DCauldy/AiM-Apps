import { tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import {
  getBofuUsage,
  reserveBlogSlot,
} from "@/lib/blog-engine/usage";
import { NextRequest } from "next/server";
import type { blogPipelineTask } from "@/triggers/blog-engine";

export const dynamic = "force-dynamic";

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

    // Hand off to the Trigger.dev pipeline task with reservation
    // metadata so its catch path can refund if needed. Dev runs the
    // task locally via the Trigger CLI; prod runs it on Trigger Cloud.
    await tasks.trigger<typeof blogPipelineTask>("blog-pipeline", {
      userId: user.id,
      triggeredBy: "manual",
      topicId,
      slotPreReserved: true,
      usedBonus: !!reservation.used_bonus,
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
