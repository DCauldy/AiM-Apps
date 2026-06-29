import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/hyperlocal/email/providers/registry";
import { dispatchCampaignRun } from "@/lib/hyperlocal/email/campaign-dispatch";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
} from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

// ============================================================
// runHlSend — load the approved emails for a run, queue per-recipient
// send_jobs rows, and return the list of recipients the wrapper task
// should fan out as hl-send-one runs.
//
// Branches by provider mode:
//   - campaign mode (Mailchimp, AC, CC, Klaviyo) dispatches one ESP
//     campaign object instead of per-recipient sends. Returns
//     mode === "campaign" with the dispatch result so the wrapper
//     knows there's nothing to fan out.
//   - transactional mode (Resend, SendGrid) queues hl_send_jobs and
//     returns the recipient list for the wrapper to batchTrigger
//     hl-send-one with per-(connection) concurrency.
// ============================================================

type CampaignBucketing = Awaited<ReturnType<typeof dispatchCampaignRun>>["bucketing"];

export type RunHlSendResult =
  | {
      mode: "campaign";
      outcome: string;
      campaignId: string | null;
      bucketing: CampaignBucketing;
    }
  | {
      mode: "transactional";
      phase: "sending" | "completed";
      runId: string;
      userId: string;
      emailConnectionId: string;
      recipients: Array<{ id: string; contact_email: string }>;
    };

export async function runHlSend(runId: string): Promise<RunHlSendResult> {
  const supabase = createServiceRoleClient();

  const { data: run } = await supabase
    .from("hl_runs")
    .select("id, user_id, email_connection_id, phase")
    .eq("id", runId)
    .single();
  if (!run) throw new Error("Run not found");
  if (!run.email_connection_id) {
    throw new Error("Run has no email_connection_id");
  }

  // ---- Branch by provider mode ----
  const conn = await getPlatformEmailConnection(
    supabase,
    run.user_id,
    run.email_connection_id,
  );
  if (!conn) throw new Error("Email connection not found");

  const adapter = getAdapter(conn.provider);
  if (adapter.mode === "campaign") {
    // Campaign-mode dispatch wants the per-app provider_metadata
    // (Mailchimp audience id, AC list id, etc.) loaded separately.
    const appState = await getAppEmailConnectionStateInternal(
      supabase,
      "hyperlocal",
      run.email_connection_id,
    );
    if (!appState)
      throw new Error("Hyperlocal app state for connection not found");

    const result = await dispatchCampaignRun({
      supabase,
      runId,
      connection: conn,
      metadata: (appState.provider_metadata ?? {}) as HlEmailAppMetadata,
      // First pass through hl-send is implicit-no-approval — if there
      // are new contacts the run parks at
      // awaiting_audience_confirmation. The approve route re-triggers
      // with the audienceApproved signal injected via the approve
      // audience route.
      audienceApproved: false,
    });
    return {
      mode: "campaign",
      outcome: result.outcome,
      campaignId: result.campaign_id ?? null,
      bucketing: result.bucketing,
    };
  }

  // ---- Transactional mode: load recipients ----
  const { data: approvedEmails } = await supabase
    .from("hl_emails")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "approved");
  const emailIds = (approvedEmails ?? []).map((e: { id: string }) => e.id);

  let recipients: Array<{ id: string; contact_email: string }> = [];
  if (emailIds.length > 0) {
    const { data: recips } = await supabase
      .from("hl_recipients")
      .select("id, contact_email")
      .in("email_id", emailIds)
      .eq("send_status", "pending");
    recipients = (recips ?? []) as Array<{ id: string; contact_email: string }>;
  }

  if (recipients.length === 0) {
    await supabase
      .from("hl_runs")
      .update({
        phase: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      mode: "transactional",
      phase: "completed",
      runId,
      userId: run.user_id,
      emailConnectionId: run.email_connection_id,
      recipients: [],
    };
  }

  // Queue hl_send_jobs rows
  const jobs = recipients.map((r) => ({
    recipient_id: r.id,
    email_connection_id: run.email_connection_id,
    status: "queued",
  }));
  const batchSize = 500;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const { error } = await supabase.from("hl_send_jobs").insert(batch);
    if (error) throw new Error(`queue-jobs: ${error.message}`);
  }

  // Mark all approved emails as "sending"
  await supabase
    .from("hl_emails")
    .update({ status: "sending" })
    .eq("run_id", runId)
    .eq("status", "approved");

  return {
    mode: "transactional",
    phase: "sending",
    runId,
    userId: run.user_id,
    emailConnectionId: run.email_connection_id,
    recipients,
  };
}
