import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { researchCompetitors } from "@/lib/radar-otterly/research";
import { sendAdminNewRequestEmail } from "@/lib/radar-otterly/email";

// ============================================================
// Radar (Otterly-backed v2) — first-run setup research.
//
// Customer hits POST /api/apps/radar/setup → row inserted with
// phase='created', status='researching' → this task is triggered →
// runs the Otterly content-check + LLM competitor research in
// parallel → writes the merged suggestion list onto the row →
// updates phase='ready_for_ops' so the admin queue picks it up.
//
// Decoupled from the HTTP request lifecycle so:
//   - No Vercel 30s max-duration risk
//   - Otterly's slow content checks (often 60-120s) get to finish
//   - The customer can close the tab and the work still completes
//
// The client polls /api/apps/radar/setup/[id]/status every ~1.5s
// during onboarding and advances the phased progress UI based on
// the row's `phase` column.
// ============================================================

interface RadarSetupResearchPayload {
  requestId: string;
  hostname: string;
}

export const radarSetupResearchTask = task({
  id: "radar-setup-research",
  queue: {
    name: "radar-setup-research",
    concurrencyLimit: 4,
  },
  retry: { maxAttempts: 2 },
  // Otterly content checks dominate runtime; cap at 5 minutes which
  // is generous enough for the slowest observed audit while still
  // bounded enough to not leak runs on a misbehaving API.
  maxDuration: 5 * 60,
  run: async (payload: RadarSetupResearchPayload, { ctx }) => {
    const { requestId, hostname } = payload;

    metadata.set("product", "radar");
    metadata.set("requestId", requestId);
    metadata.set("hostname", hostname);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "started");

    const supabase = createServiceRoleClient();

    // Phase update helper — writes to the row so the customer's
    // polling client sees real progress, and also surfaces it in
    // Trigger.dev's run metadata for ops debugging.
    const setPhase = async (phase: string) => {
      metadata.set("step", phase);
      await supabase
        .from("radar_setup_requests")
        .update({ phase })
        .eq("id", requestId);
    };

    // Stamp the Trigger.dev run ID immediately so admin tooling can
    // jump from a stuck request to the actual run logs.
    await supabase
      .from("radar_setup_requests")
      .update({ phase: "started", trigger_run_id: ctx.run.id })
      .eq("id", requestId);

    // Load the profile data for the LLM research prompt. We do this
    // here (not in the route) so the task is self-contained — could
    // be retriggered without re-marshaling profile data.
    const { data: request } = await supabase
      .from("radar_setup_requests")
      .select(
        "profile_id, platform_profiles ( display_name, full_name, professional_type, brokerage, metro_area, state, target_clients, specializations, property_types, reply_to_email )",
      )
      .eq("id", requestId)
      .maybeSingle();

    const profile =
      (request?.platform_profiles as {
        display_name?: string | null;
        full_name?: string | null;
        professional_type?: string | null;
        brokerage?: string | null;
        metro_area?: string | null;
        state?: string | null;
        target_clients?: string[] | null;
        specializations?: string[] | null;
        property_types?: string[] | null;
      } | null) ?? {};

    await setPhase("researching");

    let researchOk = false;
    let suggestedCount = 0;
    let researchError: string | null = null;
    try {
      const result = await researchCompetitors({ hostname, profile });
      researchOk = true;
      suggestedCount = result.competitors.length;

      await setPhase("merging");

      await supabase
        .from("radar_setup_requests")
        .update({
          status: "ready_for_ops",
          phase: "ready_for_ops",
          suggested_competitors: result.competitors,
          suggested_prompts: result.prompts,
          research_completed_at: new Date().toISOString(),
          research_error:
            result.errors.length > 0
              ? result.errors.map((e) => `${e.source}: ${e.message}`).join("; ")
              : null,
        })
        .eq("id", requestId);
    } catch (e) {
      researchError = e instanceof Error ? e.message : "unknown research failure";
      logger.error("[radar-setup-research] research failed", {
        requestId,
        message: researchError,
      });
      // Don't crash the run — the queue still wants the request, ops
      // can manually research competitors. phase=ready_for_ops so the
      // customer's dashboard transitions out of "researching".
      await supabase
        .from("radar_setup_requests")
        .update({
          status: "ready_for_ops",
          phase: "ready_for_ops",
          research_completed_at: new Date().toISOString(),
          research_error: researchError,
        })
        .eq("id", requestId);
    }

    // Best-effort admin notification — independent of research outcome.
    try {
      const { data: row } = await supabase
        .from("radar_setup_requests")
        .select(
          "user_id, hostname, platform_profiles ( display_name, full_name, reply_to_email )",
        )
        .eq("id", requestId)
        .maybeSingle();
      const requesterAuth = row
        ? await supabase.auth.admin.getUserById(row.user_id)
        : null;
      const profileRow = (row?.platform_profiles ?? null) as {
        display_name?: string | null;
        full_name?: string | null;
        reply_to_email?: string | null;
      } | null;
      await sendAdminNewRequestEmail({
        requestId,
        hostname,
        requesterEmail:
          requesterAuth?.data.user?.email ??
          profileRow?.reply_to_email ??
          null,
        requesterName:
          profileRow?.display_name ?? profileRow?.full_name ?? null,
      });
    } catch (e) {
      logger.warn("[radar-setup-research] admin email failed", {
        requestId,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    metadata.set("step", "completed");
    metadata.set("researchOk", researchOk);
    metadata.set("suggestedCount", suggestedCount);
    if (researchError) metadata.set("researchError", researchError);
    await metadata.flush();

    logger.log("Radar setup research finished", {
      requestId,
      suggestedCount,
      researchOk,
    });

    return { requestId, suggestedCount, researchOk };
  },
});
