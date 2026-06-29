import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import { runHlSend } from "@/lib/hyperlocal/send";
import { runHlSendOne, type RunHlSendOneInput } from "@/lib/hyperlocal/send-one";

// ============================================================
// Hyperlocal send pair — fan-out + per-recipient send.
//
// hlSendTask        — entry point fired by triggerSend(runId) after
//                     the agent approves the drafts. Branches by
//                     ESP provider mode: campaign-mode (Mailchimp,
//                     AC, etc.) dispatches one ESP campaign object
//                     and is done; transactional-mode (Resend,
//                     SendGrid) queues hl_send_jobs and fans out to
//                     hlSendOneTask, ONE per recipient.
//
// hlSendOneTask     — sends one email. Per-connection concurrency
//                     keeps any single ESP/mailbox at <=5 in-flight
//                     sends; the queue is named at trigger time so
//                     concurrency partitions by emailConnectionId
//                     across the project.
// ============================================================

interface HlSendPayload {
  runId: string;
}

export const hlSendTask = task({
  id: "hl-send",
  queue: {
    name: "hl-send",
    concurrencyLimit: 5,
  },
  retry: { maxAttempts: 1 },
  maxDuration: 15 * 60,
  run: async (payload: HlSendPayload, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("runId", payload.runId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "loading");

    logger.log("Hyperlocal send starting", { runId: payload.runId });

    const result = await runHlSend(payload.runId);

    if (result.mode === "campaign") {
      metadata.set("step", "completed");
      metadata.set("mode", "campaign");
      metadata.set("outcome", result.outcome);
      if (result.campaignId) metadata.set("campaignId", result.campaignId);
      await metadata.flush();

      logger.log("Hyperlocal send finished (campaign mode)", {
        runId: payload.runId,
        outcome: result.outcome,
        campaignId: result.campaignId,
      });
      return {
        mode: "campaign" as const,
        outcome: result.outcome,
        campaign_id: result.campaignId,
        bucketing: result.bucketing,
      };
    }

    // Transactional mode: fan out one hl-send-one task per recipient.
    // hlSendOneTask's queue has concurrencyLimit: 5; setting
    // concurrencyKey to the emailConnectionId partitions that cap
    // per-connection, so any single mailbox/ESP holds at <=5
    // in-flight sends across the project (matches the prior Inngest
    // per-emailConnectionId concurrency rule).
    if (result.recipients.length > 0) {
      await hlSendOneTask.batchTrigger(
        result.recipients.map((r) => ({
          payload: {
            recipientId: r.id,
            emailConnectionId: result.emailConnectionId,
            userId: result.userId,
            runId: result.runId,
          } satisfies RunHlSendOneInput,
          options: {
            concurrencyKey: result.emailConnectionId,
            tags: [
              `hl-run:${result.runId}`,
              `hl-connection:${result.emailConnectionId}`,
            ],
          },
        })),
      );
    }

    metadata.set("step", "completed");
    metadata.set("mode", "transactional");
    metadata.set("phase", result.phase);
    metadata.set("queued", result.recipients.length);
    await metadata.flush();

    logger.log("Hyperlocal send finished (transactional fan-out)", {
      runId: payload.runId,
      phase: result.phase,
      queued: result.recipients.length,
    });

    return {
      mode: "transactional" as const,
      phase: result.phase,
      queued: result.recipients.length,
    };
  },
});

export const hlSendOneTask = task({
  id: "hl-send-one",
  // Cap of 5 simultaneous sends per emailConnectionId — the trigger
  // sets concurrencyKey to the connection id, which partitions this
  // single queue into per-connection sub-queues each with their own
  // limit-of-5 cap. Matches the old Inngest
  // concurrency: { key: "event.data.emailConnectionId", limit: 5 }
  // rule.
  queue: {
    name: "hl-send-one",
    concurrencyLimit: 5,
  },
  retry: { maxAttempts: 3 },
  maxDuration: 5 * 60,
  run: async (payload: RunHlSendOneInput, { ctx }) => {
    metadata.set("product", "hyperlocal");
    metadata.set("runId", payload.runId);
    metadata.set("recipientId", payload.recipientId);
    metadata.set("emailConnectionId", payload.emailConnectionId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "sending");

    const result = await runHlSendOne(payload);

    metadata.set("step", "completed");
    metadata.set("sent", result.sent);
    if (result.skipped) metadata.set("skipped", true);
    if (result.reason) metadata.set("reason", result.reason);
    await metadata.flush();

    return result;
  },
});
