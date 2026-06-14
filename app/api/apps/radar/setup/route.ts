import "server-only";

import { NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import { normalizeHostname } from "@/lib/radar-otterly/match";
import type { radarSetupResearchTask } from "@/triggers/radar-otterly";

export const dynamic = "force-dynamic";

// POST /api/apps/radar/setup
//
// Customer-triggered first-run flow. Inserts a row in
// radar_setup_requests (status='researching', phase='created'), fires
// the radar-setup-research Trigger.dev task, returns immediately.
// All slow work — Otterly content check, LLM competitor research,
// admin notification email — runs in the background task. The client
// polls /api/apps/radar/setup/[id]/status for phase updates.
//
// Returns in <1s, well under Vercel's 30s max-duration.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json({ status: "no_profile" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { hostname?: string };
  const hostname = normalizeHostname(body.hostname ?? null);
  if (!hostname) {
    return Response.json({ status: "invalid_hostname" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Reuse an existing non-terminal request — the unique partial index
  // on (profile_id) where status in (pending, researching,
  // ready_for_ops) enforces this at the DB level too.
  const { data: existing } = await service
    .from("radar_setup_requests")
    .select("id, status, phase, requested_at")
    .eq("profile_id", profile.id)
    .in("status", ["pending", "researching", "ready_for_ops"])
    .maybeSingle();

  if (existing) {
    return Response.json({
      status: "existing",
      request_id: existing.id,
      request_status: existing.status,
      phase: existing.phase,
      requested_at: existing.requested_at,
    });
  }

  const { data: inserted, error: insertError } = await service
    .from("radar_setup_requests")
    .insert({
      user_id: user.id,
      profile_id: profile.id,
      hostname,
      status: "researching",
      phase: "created",
    })
    .select("id, requested_at")
    .single();

  if (insertError || !inserted) {
    return Response.json(
      { status: "db_error", message: insertError?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  const requestId = inserted.id;

  // Fire the background task. Idempotency key prevents double-dispatch
  // if the customer rapid-clicks Submit before the row is visible to
  // the existing-check above.
  try {
    await tasks.trigger<typeof radarSetupResearchTask>(
      "radar-setup-research",
      { requestId, hostname },
      {
        idempotencyKey: `radar-setup-${requestId}`,
        idempotencyKeyTTL: "1h",
        tags: [`radar-setup:${requestId}`, `radar-hostname:${hostname}`],
      },
    );
  } catch (e) {
    // If the task dispatch fails, surface it but keep the row — ops
    // can retrigger via admin tooling rather than the customer
    // starting over. Mark as failed phase so the dashboard doesn't
    // hang on "researching".
    console.error("[radar/setup] task dispatch failed:", e);
    await service
      .from("radar_setup_requests")
      .update({
        phase: "failed",
        research_error:
          e instanceof Error ? `dispatch: ${e.message}` : "dispatch failed",
      })
      .eq("id", requestId);
  }

  return Response.json({
    status: "created",
    request_id: requestId,
    phase: "created",
    requested_at: inserted.requested_at,
  });
}
