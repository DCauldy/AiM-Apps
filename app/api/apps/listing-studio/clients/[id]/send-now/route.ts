import "server-only";

import { NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  getListingStudioUsage,
  getMonthStart,
} from "@/lib/listing-studio/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import type { cmaDeliverTask } from "@/triggers/cma-deliver";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/listing-studio/clients/[id]/send-now
 *
 * Fires a cma-deliver event off-cadence. Used for:
 *   - "Resend now" after an agent fixes the address on a failed delivery
 *   - "Try it on me first" sends from the per-client UI before turning
 *     on cadence for that client
 *
 * Soft cap on manual sends per month (pack-defined). Throws 429 when
 * exceeded — agent has to wait for the month rollover or upgrade.
 *
 * Does NOT require enrolled = true. Per CMA_PLAN.md §5: manual sends
 * exist precisely so the agent can shake out a CMA for a client who
 * isn't yet on cadence.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();

  // 1. Confirm the client exists and isn't unsubscribed.
  const { data: client } = await service
    .from("cma_clients")
    .select("id, user_id, address, email, unsubscribed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return Response.json({ error: "Not found" }, { status: 404 });
  if (client.unsubscribed_at) {
    return Response.json(
      { error: "This client unsubscribed. Sending again would violate CAN-SPAM." },
      { status: 409 },
    );
  }
  if (!client.address || !client.email) {
    return Response.json(
      { error: "Client is missing an address or email — fill those in first." },
      { status: 400 },
    );
  }

  // 2. Soft-cap check: manual sends per month per pack.
  const usage = await getListingStudioUsage(user.id);
  const limit = usage.manualSendsLimit;
  if (limit !== UNLIMITED && usage.manualSends >= (limit as number)) {
    return Response.json(
      {
        error: `Manual send limit reached (${usage.manualSends}/${limit} this month). The cap resets ${usage.periodEnd}.`,
      },
      { status: 429 },
    );
  }

  // 3. Fire the Trigger.dev task. The runCmaDelivery helper inside
  //    the task bumps the meter via cma_increment_delivery_count.
  try {
    await tasks.trigger<typeof cmaDeliverTask>("cma-deliver", {
      clientId: id,
      triggerSource: "manual",
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Failed to enqueue delivery",
      },
      { status: 500 },
    );
  }

  return Response.json({
    queued: true,
    period_start: getMonthStart(),
    manual_sends_this_month: usage.manualSends + 1,
    manual_sends_limit: limit,
  });
}
