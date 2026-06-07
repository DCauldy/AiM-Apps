import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchEmail } from "@/lib/hyperlocal/email/dispatch";
import { buildUnsubscribeUrl } from "@/lib/hyperlocal/email/unsubscribe";
import { isSuppressed, addSuppression } from "@/lib/hyperlocal/email/suppressions";
import type { HlEmailConnection, PlatformSenderProfile } from "@/types/hyperlocal";

type HlSendOneEvent = {
  name: "hl/recipient.send";
  data: {
    recipientId: string;
    emailConnectionId: string;
    userId: string;
    runId: string;
  };
};

/**
 * Sends one email to one recipient. Rate-limited per email_connection_id.
 *
 * Concurrency cap: 5 simultaneous sends per connection (avoid hammering one mailbox).
 * Throttle: 25/sec per connection (safely below Gmail's 30/s, MS Graph's ~30/s).
 */
export const hlSendOne = inngest.createFunction(
  {
    id: "hl-send-one",
    name: "Hyperlocal: Send one",
    retries: 3,
    concurrency: [{ key: "event.data.emailConnectionId", limit: 5 }],
    throttle: {
      limit: 25,
      period: "1s",
      key: "event.data.emailConnectionId",
    },
    triggers: [{ event: "hl/recipient.send" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: HlSendOneEvent["data"]; id?: string };
    step: any;
  }) => {
    const { recipientId, emailConnectionId, userId, runId } = event.data;
    const supabase = createServiceRoleClient();

    // ---- Load everything we need ----
    const ctx = await step.run("load-send-context", async () => {
      const [
        { data: recipient },
        { data: connection },
      ] = await Promise.all([
        supabase
          .from("hl_recipients")
          .select(
            "id, email_id, contact_email, contact_first_name, contact_last_name, unsubscribe_token, send_status"
          )
          .eq("id", recipientId)
          .single(),
        supabase
          .from("hl_email_connections")
          .select("*")
          .eq("id", emailConnectionId)
          .single(),
      ]);
      if (!recipient) throw new Error("Recipient not found");
      if (!connection) throw new Error("Email connection not found");
      if (recipient.send_status !== "pending") {
        return { skip: true };
      }

      const { data: email } = await supabase
        .from("hl_emails")
        .select("subject, preheader, html, plain_text, run_id, status")
        .eq("id", recipient.email_id)
        .single();
      if (!email) throw new Error("Email draft not found");

      // Check if user cancelled the run mid-flight
      const { data: run } = await supabase
        .from("hl_runs")
        .select("phase, profile_id")
        .eq("id", runId)
        .single();
      if (!run || run.phase === "cancelled" || run.phase === "failed") {
        return { skip: true, reason: "run_cancelled" as const };
      }

      // Sender resolution — prefer run.profile_id (new path → platform_profiles),
      // fall back to legacy run.sender_profile_id snapshot.
      let sender: Record<string, unknown> | null = null;
      if (run.profile_id) {
        const { data: pp } = await supabase
          .from("platform_profiles")
          .select("id, full_name, display_name, title, brokerage, phone, reply_to_email, license_number, physical_address, sign_off")
          .eq("id", run.profile_id)
          .maybeSingle();
        if (pp && pp.physical_address) {
          sender = {
            id: pp.id,
            full_name: pp.full_name ?? pp.display_name,
            title: pp.title,
            brokerage: pp.brokerage,
            phone: pp.phone,
            reply_to_email: pp.reply_to_email,
            license_number: pp.license_number,
            physical_address: pp.physical_address,
            sign_off: pp.sign_off,
          };
        }
      }
      if (!sender) throw new Error("Sender profile missing — run.profile_id is required");

      return {
        skip: false,
        recipient,
        connection: connection as HlEmailConnection,
        email,
        sender: sender as unknown as PlatformSenderProfile,
      };
    });

    if (ctx.skip) return { skipped: true, reason: ctx.reason };

    const {
      recipient,
      connection,
      email,
      sender,
    } = ctx as {
      skip: false;
      recipient: {
        id: string;
        email_id: string;
        contact_email: string;
        contact_first_name: string | null;
        contact_last_name: string | null;
        unsubscribe_token: string | null;
      };
      connection: HlEmailConnection;
      email: {
        subject: string;
        preheader: string;
        html: string;
        plain_text: string;
        run_id: string;
      };
      sender: PlatformSenderProfile;
    };

    // ---- Suppression check ----
    const suppressed = await step.run("check-suppression", async () =>
      isSuppressed(userId, recipient.contact_email)
    );
    if (suppressed) {
      await supabase
        .from("hl_recipients")
        .update({ send_status: "suppressed" })
        .eq("id", recipient.id);
      await supabase
        .from("hl_send_jobs")
        .update({ status: "done", last_error: "suppressed" })
        .eq("recipient_id", recipient.id)
        .eq("status", "queued");
      return { skipped: true, reason: "suppressed" };
    }

    // ---- Build final message: inject per-recipient unsubscribe URL ----
    const unsubscribeUrl = recipient.unsubscribe_token
      ? buildUnsubscribeUrl(recipient.unsubscribe_token)
      : "";
    const finalHtml = email.html
      .replace(/\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g, unsubscribeUrl)
      .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);
    const finalText = email.plain_text
      .replace(/\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g, unsubscribeUrl)
      .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

    // ---- Send ----
    const sendResult = await step.run("send-email", async () =>
      dispatchEmail(connection, {
        from: {
          email: connection.email_address,
          name: sender.full_name,
        },
        reply_to: sender.reply_to_email ?? undefined,
        to: {
          email: recipient.contact_email,
          name:
            [recipient.contact_first_name, recipient.contact_last_name]
              .filter(Boolean)
              .join(" ") || undefined,
        },
        subject: email.subject,
        html: finalHtml,
        text: finalText,
        headers: unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:unsubscribe@${connection.email_address.split("@")[1] ?? "apps.aimarketingacademy.com"}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
        tags: {
          run_id: runId,
          email_id: recipient.email_id,
        },
      })
    );

    // ---- Persist result ----
    await step.run("persist-result", async () => {
      const now = new Date().toISOString();
      if (sendResult.success) {
        await supabase
          .from("hl_recipients")
          .update({
            send_status: "sent",
            provider_message_id: sendResult.provider_message_id ?? null,
            sent_at: now,
            error_message: null,
          })
          .eq("id", recipient.id);
        await supabase
          .from("hl_send_jobs")
          .update({ status: "done", updated_at: now })
          .eq("recipient_id", recipient.id);
        // Increment run counter
        await supabase.rpc("hl_increment_run_sent", { p_run_id: runId }).then(
          () => undefined,
          // Fallback if RPC isn't installed — manual increment
          async () => {
            const { data: r } = await supabase
              .from("hl_runs")
              .select("emails_sent")
              .eq("id", runId)
              .single();
            await supabase
              .from("hl_runs")
              .update({ emails_sent: (r?.emails_sent ?? 0) + 1 })
              .eq("id", runId);
          }
        );
        // Update connection last_send_at
        await supabase
          .from("hl_email_connections")
          .update({ last_send_at: now, last_error: null })
          .eq("id", connection.id);
      } else {
        const isBounce = sendResult.is_hard_bounce === true;
        await supabase
          .from("hl_recipients")
          .update({
            send_status: isBounce ? "bounced" : "failed",
            error_message: sendResult.error ?? null,
          })
          .eq("id", recipient.id);
        await supabase
          .from("hl_send_jobs")
          .update({
            status: "failed",
            last_error: sendResult.error ?? null,
            updated_at: now,
          })
          .eq("recipient_id", recipient.id);
        await supabase.rpc("hl_increment_run_failed", { p_run_id: runId }).then(
          () => undefined,
          async () => {
            const { data: r } = await supabase
              .from("hl_runs")
              .select("emails_failed")
              .eq("id", runId)
              .single();
            await supabase
              .from("hl_runs")
              .update({ emails_failed: (r?.emails_failed ?? 0) + 1 })
              .eq("id", runId);
          }
        );

        // Auto-suppress hard bounces
        if (isBounce) {
          await addSuppression({
            userId,
            email: recipient.contact_email,
            reason: "bounced",
            sourceRunId: runId,
          });
        }
        // Persist last_error on the connection
        await supabase
          .from("hl_email_connections")
          .update({ last_error: sendResult.error ?? null })
          .eq("id", connection.id);
      }
    });

    // ---- Maybe finalize run ----
    await step.run("maybe-finalize-run", async () => {
      const { count: stillPending } = await supabase
        .from("hl_recipients")
        .select("id, hl_emails!inner(run_id)", { count: "exact", head: true })
        .eq("send_status", "pending")
        .eq("hl_emails.run_id", runId);
      if ((stillPending ?? 0) === 0) {
        await supabase
          .from("hl_runs")
          .update({
            phase: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        // Mark emails as sent
        await supabase
          .from("hl_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("run_id", runId)
          .eq("status", "sending");
      }
    });

    return { sent: sendResult.success };
  }
);
