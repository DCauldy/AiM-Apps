import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/hyperlocal/email/providers/registry";
import { dispatchCampaignRun } from "@/lib/hyperlocal/email/campaign-dispatch";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
} from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

type HlSendEvent = {
  name: "hl/run.send.approved";
  data: { runId: string };
};

/**
 * Fan-out function: enumerates all pending recipients for approved emails
 * and dispatches one hl/recipient.send event per recipient.
 *
 * The actual sending happens in hl-send-one (rate-limited per email connection).
 */
export const hlSend = inngest.createFunction(
  {
    id: "hl-send",
    name: "Hyperlocal: Send (fan-out)",
    retries: 1,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "hl/run.send.approved" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: HlSendEvent["data"]; id?: string };
    step: any;
  }) => {
    const { runId } = event.data;
    const supabase = createServiceRoleClient();

    const run = await step.run("load-run", async () => {
      const { data } = await supabase
        .from("hl_runs")
        .select("id, user_id, email_connection_id, phase")
        .eq("id", runId)
        .single();
      if (!data) throw new Error("Run not found");
      if (!data.email_connection_id) {
        throw new Error("Run has no email_connection_id");
      }
      return data;
    });

    // ---- Branch by provider mode ----
    // Campaign-mode (Mailchimp, AC, CC, Klaviyo) collapses into one ESP
    // campaign object. We skip the per-recipient queue and dispatch
    // through campaign-dispatch instead. Transactional-mode (Resend,
    // SendGrid) keeps the current fan-out path below.
    const conn = await step.run("load-connection", async () => {
      const c = await getPlatformEmailConnection(
        supabase,
        run.user_id,
        run.email_connection_id,
      );
      if (!c) throw new Error("Email connection not found");
      return c;
    });

    const adapter = getAdapter(conn.provider);
    if (adapter.mode === "campaign") {
      // Campaign-mode dispatch wants the per-app provider_metadata
      // (Mailchimp audience id, AC list id, etc.) loaded separately.
      const appState = await step.run("load-app-state", async () => {
        const s = await getAppEmailConnectionStateInternal(
          supabase,
          "hyperlocal",
          run.email_connection_id,
        );
        if (!s) throw new Error("Hyperlocal app state for connection not found");
        return s;
      });

      const result = await step.run("campaign-dispatch", () =>
        dispatchCampaignRun({
          supabase,
          runId,
          connection: conn,
          metadata: (appState.provider_metadata ?? {}) as HlEmailAppMetadata,
          // First pass through hl-send is implicit-no-approval — if there
          // are new contacts the run parks at awaiting_audience_confirmation.
          // The approve route re-triggers hl-send with the audienceApproved
          // signal injected via a re-fired event (see approve-audience route).
          audienceApproved: false,
        }),
      );
      return {
        mode: "campaign",
        outcome: result.outcome,
        campaign_id: result.campaign_id,
        bucketing: result.bucketing,
      };
    }

    // Load all recipients of approved emails for this run
    const recipients = await step.run("load-recipients", async () => {
      const { data: approvedEmails } = await supabase
        .from("hl_emails")
        .select("id")
        .eq("run_id", runId)
        .eq("status", "approved");
      const emailIds = (approvedEmails ?? []).map(
        (e: { id: string }) => e.id
      );
      if (emailIds.length === 0) return [];

      const { data: recips } = await supabase
        .from("hl_recipients")
        .select("id, contact_email")
        .in("email_id", emailIds)
        .eq("send_status", "pending");
      return recips ?? [];
    });

    if (recipients.length === 0) {
      await supabase
        .from("hl_runs")
        .update({
          phase: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { phase: "completed", sent: 0 };
    }

    // Create send_jobs rows and dispatch per-recipient events
    await step.run("queue-jobs", async () => {
      const jobs = recipients.map(
        (r: { id: string }) => ({
          recipient_id: r.id,
          email_connection_id: run.email_connection_id,
          status: "queued",
        })
      );
      // Insert in batches
      const batchSize = 500;
      for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize);
        const { error } = await supabase.from("hl_send_jobs").insert(batch);
        if (error) throw new Error(`queue-jobs: ${error.message}`);
      }
    });

    // Mark all approved emails as "sending"
    await supabase
      .from("hl_emails")
      .update({ status: "sending" })
      .eq("run_id", runId)
      .eq("status", "approved");

    // Fan out — Inngest's throttle/concurrency on hl-send-one will pace these
    await step.sendEvent("dispatch-recipients", {
      events: recipients.map(
        (r: { id: string }) => ({
          name: "hl/recipient.send",
          data: {
            recipientId: r.id,
            emailConnectionId: run.email_connection_id,
            userId: run.user_id,
            runId,
          },
        })
      ),
    });

    return { phase: "sending", queued: recipients.length };
  }
);
