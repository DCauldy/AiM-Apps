import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchEmail } from "@/lib/hyperlocal/email/dispatch";
import { buildUnsubscribeUrl } from "@/lib/hyperlocal/email/unsubscribe";
import {
  isSuppressed,
  addSuppression,
} from "@/lib/hyperlocal/email/suppressions";
import {
  assertSendOk,
  ComplianceError,
} from "@/lib/hyperlocal/email/compliance";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
  updateAppEmailState,
} from "@/lib/platform/connections";
import type { PlatformSenderProfile } from "@/types/hyperlocal";
import type { PlatformEmailConnection } from "@/types/platform-connections";

// ============================================================
// runHlSendOne — send one Hyperlocal email to one recipient.
//
// Pure async helper called by the Trigger.dev hlSendOneTask wrapper.
// The wrapper provides per-connection concurrency via a per-key
// queue (matches the old Inngest per-emailConnectionId concurrency
// limit). Throttling is implicit in the concurrency cap — Trigger.dev
// v4 doesn't have a dedicated throttle primitive, but a connection
// cap of 5 holds Resend / SendGrid / Mailbox throughput well under
// their per-second limits in practice.
// ============================================================

export interface RunHlSendOneInput {
  recipientId: string;
  emailConnectionId: string;
  userId: string;
  runId: string;
}

export interface RunHlSendOneResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
}

export async function runHlSendOne(
  input: RunHlSendOneInput,
): Promise<RunHlSendOneResult> {
  const { recipientId, emailConnectionId, userId, runId } = input;
  const supabase = createServiceRoleClient();

  // ---- Load everything we need ----
  const [{ data: recipient }, connection, appState] = await Promise.all([
    supabase
      .from("hl_recipients")
      .select(
        "id, email_id, contact_email, contact_first_name, contact_last_name, unsubscribe_token, send_status",
      )
      .eq("id", recipientId)
      .single(),
    getPlatformEmailConnection(supabase, userId, emailConnectionId),
    getAppEmailConnectionStateInternal(
      supabase,
      "hyperlocal",
      emailConnectionId,
    ),
  ]);
  if (!recipient) throw new Error("Recipient not found");
  if (!connection) throw new Error("Email connection not found");
  if (!appState)
    throw new Error("Hyperlocal app state for connection not found");
  if (recipient.send_status !== "pending") {
    return { sent: false, skipped: true, reason: "not_pending" };
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
    return { sent: false, skipped: true, reason: "run_cancelled" };
  }

  // Sender resolution — pull from platform_profiles via run.profile_id.
  let sender: Record<string, unknown> | null = null;
  if (run.profile_id) {
    const { data: pp } = await supabase
      .from("platform_profiles")
      .select(
        "id, full_name, display_name, title, brokerage, phone, reply_to_email, license_number, license_info, regulatory_body, state, physical_address, sign_off",
      )
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
        license_info: pp.license_info,
        regulatory_body: pp.regulatory_body,
        state: pp.state,
        physical_address: pp.physical_address,
        sign_off: pp.sign_off,
      };
    }
  }
  if (!sender)
    throw new Error("Sender profile missing — run.profile_id is required");

  const appPaused = appState.paused;
  const typedConnection = connection as PlatformEmailConnection;
  const typedSender = sender as unknown as PlatformSenderProfile;

  // ---- Suppression check ----
  const suppressed = await isSuppressed(userId, recipient.contact_email);
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
    return { sent: false, skipped: true, reason: "suppressed" };
  }

  // ---- Per-recipient compliance gate (kill switch + token must exist) ----
  // is_active lives on the platform row, paused on the per-app state row.
  try {
    assertSendOk({
      connection: { is_active: typedConnection.is_active, paused: appPaused },
      recipient: {
        contact_email: recipient.contact_email,
        unsubscribe_token: recipient.unsubscribe_token,
      },
    });
  } catch (err) {
    if (err instanceof ComplianceError) {
      const reason = err.issues.map((i) => i.code).join(",");
      await supabase
        .from("hl_recipients")
        .update({ send_status: "failed", error_message: err.message })
        .eq("id", recipient.id);
      await supabase
        .from("hl_send_jobs")
        .update({ status: "failed", last_error: err.message })
        .eq("recipient_id", recipient.id)
        .eq("status", "queued");
      return { sent: false, skipped: true, reason };
    }
    throw err;
  }

  // ---- Build final message: inject per-recipient unsubscribe URL ----
  // unsubscribe_token is guaranteed non-empty by assertSendOk above.
  const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribe_token!);
  const finalHtml = email.html
    .replace(
      /\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g,
      unsubscribeUrl,
    )
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);
  const finalText = email.plain_text
    .replace(
      /\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g,
      unsubscribeUrl,
    )
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

  // ---- Send ----
  const sendResult = await dispatchEmail(typedConnection, {
    from: {
      email: typedConnection.email_address,
      name: typedSender.full_name,
    },
    reply_to: typedSender.reply_to_email ?? undefined,
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
          // HTTPS one-click only — the mailto half is optional in RFC
          // 2369 and we don't operate an inbox to receive it, so listing
          // it would silently drop unsubscribe attempts from clients
          // that prefer mailto over HTTPS.
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    tags: {
      run_id: runId,
      email_id: recipient.email_id,
    },
  });

  // ---- Persist result ----
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
    await supabase
      .rpc("hl_increment_run_sent", { p_run_id: runId })
      .then(
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
        },
      );
    // Update per-app last_send_at on app_email_connection_state.
    await updateAppEmailState(
      supabase,
      userId,
      "hyperlocal",
      typedConnection.id,
      {
        lastSendAt: now,
        lastError: null,
      },
    );
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
    await supabase
      .rpc("hl_increment_run_failed", { p_run_id: runId })
      .then(
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
        },
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
    // Persist last_error on the per-app state row.
    await updateAppEmailState(
      supabase,
      userId,
      "hyperlocal",
      typedConnection.id,
      {
        lastError: sendResult.error ?? null,
      },
    );
  }

  // ---- Maybe finalize run ----
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

  return { sent: sendResult.success };
}
