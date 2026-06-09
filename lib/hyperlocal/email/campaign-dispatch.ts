import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "./providers/registry";
import { isSuppressed } from "./suppressions";
import type {
  ContactLookupRow,
  ContactUpsert,
} from "./providers/types";
import type { HlEmailConnection } from "@/types/hyperlocal";

// ============================================================
// Campaign-mode dispatch.
//
// Where transactional providers (Resend, SendGrid) do a per-recipient
// fan-out via hl-send-one, campaign-mode providers (Mailchimp, AC, CC,
// Klaviyo) want a single bulk operation:
//
//   1. Bucket recipients via adapter.lookupContacts → subscribed /
//      unsubscribed / cleaned / pending / not_found.
//   2. If not_found > 0 AND user hasn't already approved, park the run in
//      awaiting_audience_confirmation and return — the review UI surfaces
//      the diff for the user to approve or decline.
//   3. Upsert approved contacts via adapter.upsertContacts with the run's
//      tag.
//   4. Create the campaign in the ESP + send.
//   5. Persist provider_campaign_id on the run, flip phase to "sending".
//
// All side-effects are best-effort serial — Mailchimp's rate limits are
// generous (~10 req/s) and the lookup/upsert volumes are small.
// ============================================================

export interface CampaignDispatchResult {
  outcome: "dispatched" | "awaiting_confirmation" | "no_recipients";
  campaign_id?: string;
  bucketing: {
    subscribed: number;
    unsubscribed: number;
    cleaned: number;
    pending: number;
    not_found: number;
    suppressed_locally: number;
  };
  new_contacts?: Array<{ email: string; first_name: string | null; last_name: string | null }>;
}

export interface CampaignDispatchInput {
  supabase: SupabaseClient;
  runId: string;
  connection: HlEmailConnection;
  /** Set on retry after the user approves adding new contacts. When true we
   *  skip the awaiting_audience_confirmation park and upsert everyone in
   *  the not_found bucket. */
  audienceApproved?: boolean;
}

export async function dispatchCampaignRun(
  input: CampaignDispatchInput,
): Promise<CampaignDispatchResult> {
  const { supabase, runId, connection, audienceApproved } = input;
  const adapter = getAdapter(connection.provider);
  if (adapter.mode !== "campaign") {
    throw new Error(
      `dispatchCampaignRun called on a ${adapter.mode}-mode provider (${connection.provider}).`,
    );
  }
  if (
    !adapter.lookupContacts ||
    !adapter.upsertContacts ||
    !adapter.createCampaign ||
    !adapter.sendCampaign
  ) {
    throw new Error(
      `Adapter for ${connection.provider} is mode "campaign" but missing required methods.`,
    );
  }

  // ---- Load run + recipients + email content ----
  const { data: run } = await supabase
    .from("hl_runs")
    .select("id, user_id, profile_id, phase")
    .eq("id", runId)
    .single();
  if (!run) throw new Error("Run not found");

  // For campaign-mode we collapse all approved emails for this run into a
  // single Mailchimp campaign. Pull the first approved email's content as
  // the campaign body; multi-segment runs ship as one consolidated campaign
  // for v1 (a future improvement: one Mailchimp campaign per segment).
  const { data: approvedEmails } = await supabase
    .from("hl_emails")
    .select("id, subject, preheader, html, plain_text")
    .eq("run_id", runId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (!approvedEmails || approvedEmails.length === 0) {
    throw new Error("No approved drafts for this run.");
  }
  const primaryEmail = approvedEmails[0];

  // Pull recipient list (across all approved emails). Email is the join key
  // that matches Mailchimp's audience identifier.
  const emailIds = approvedEmails.map((e) => e.id);
  const { data: recipients } = await supabase
    .from("hl_recipients")
    .select("id, contact_email, contact_first_name, contact_last_name")
    .in("email_id", emailIds)
    .eq("send_status", "pending");

  if (!recipients || recipients.length === 0) {
    return {
      outcome: "no_recipients",
      bucketing: zeroBucket(),
    };
  }

  // ---- Filter against the local suppression list first ----
  const candidateEmails = recipients.map((r) => r.contact_email.toLowerCase());
  const suppressedLocally: string[] = [];
  for (const email of candidateEmails) {
    if (await isSuppressed(run.user_id, email)) suppressedLocally.push(email);
  }
  const sendableRecipients = recipients.filter(
    (r) => !suppressedLocally.includes(r.contact_email.toLowerCase()),
  );

  // ---- Bucket via the ESP audience ----
  const lookup = await adapter.lookupContacts(
    connection,
    sendableRecipients.map((r) => r.contact_email),
  );
  const byEmail = new Map<string, ContactLookupRow>();
  for (const row of lookup.rows) byEmail.set(row.email.toLowerCase(), row);

  const buckets: CampaignDispatchResult["bucketing"] = {
    subscribed: 0,
    unsubscribed: 0,
    cleaned: 0,
    pending: 0,
    not_found: 0,
    suppressed_locally: suppressedLocally.length,
  };
  const toUpsert: ContactUpsert[] = [];
  const subscribedEmails: string[] = [];

  for (const r of sendableRecipients) {
    const email = r.contact_email.toLowerCase();
    const found = byEmail.get(email);
    const state = found?.status.state ?? "not_found";
    if (state === "subscribed") {
      buckets.subscribed += 1;
      subscribedEmails.push(email);
    } else if (state === "unsubscribed") {
      buckets.unsubscribed += 1;
    } else if (state === "cleaned") {
      buckets.cleaned += 1;
    } else if (state === "pending") {
      buckets.pending += 1;
    } else {
      buckets.not_found += 1;
      toUpsert.push({
        email,
        first_name: r.contact_first_name,
        last_name: r.contact_last_name,
      });
    }
  }

  // ---- Park for audience confirmation if needed ----
  if (toUpsert.length > 0 && !audienceApproved) {
    await supabase
      .from("hl_runs")
      .update({
        phase: "awaiting_audience_confirmation",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      outcome: "awaiting_confirmation",
      bucketing: buckets,
      new_contacts: toUpsert.map((c) => ({
        email: c.email,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
      })),
    };
  }

  if (subscribedEmails.length === 0 && toUpsert.length === 0) {
    return { outcome: "no_recipients", bucketing: buckets };
  }

  // ---- Tag the recipients (existing + new) so the campaign can target them ----
  const tag = `hl:run:${runId.slice(0, 8)}`;

  // Upsert the new contacts (approved this round). Mailchimp PUTs them
  // with the tag attached — they're now targetable by the campaign.
  if (toUpsert.length > 0) {
    await adapter.upsertContacts(connection, toUpsert, tag);
  }

  // Already-subscribed contacts need the tag added too — upsertContacts
  // with status "subscribed" is idempotent in Mailchimp and just attaches
  // the tag without changing subscription state.
  const subscribedAsUpserts: ContactUpsert[] = sendableRecipients
    .filter((r) => subscribedEmails.includes(r.contact_email.toLowerCase()))
    .map((r) => ({
      email: r.contact_email,
      first_name: r.contact_first_name,
      last_name: r.contact_last_name,
    }));
  if (subscribedAsUpserts.length > 0) {
    await adapter.upsertContacts(connection, subscribedAsUpserts, tag);
  }

  // ---- Create + send the campaign ----
  const ref = await adapter.createCampaign(connection, {
    subject: primaryEmail.subject ?? "Market update",
    preheader: primaryEmail.preheader ?? "",
    from_name: connection.display_name ?? connection.email_address,
    from_email: connection.email_address,
    reply_to: null,
    html: primaryEmail.html ?? "",
    text: primaryEmail.plain_text ?? "",
    tag,
  });

  await adapter.sendCampaign(connection, ref);

  // ---- Persist run state ----
  // Stamp every recipient with the campaign id as their provider_message_id
  // so the webhook receiver can resolve events back to the row.
  const allRecipientIds = sendableRecipients.map((r) => r.id);
  await supabase
    .from("hl_recipients")
    .update({
      provider_message_id: ref.campaign_id,
      send_status: "sent",
      sent_at: new Date().toISOString(),
    })
    .in("id", allRecipientIds);

  await supabase
    .from("hl_runs")
    .update({
      phase: "sending",
      provider_campaign_id: ref.campaign_id,
      provider_campaign_status: "sending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await supabase
    .from("hl_emails")
    .update({ status: "sending" })
    .in("id", emailIds);

  return {
    outcome: "dispatched",
    campaign_id: ref.campaign_id,
    bucketing: buckets,
  };
}

function zeroBucket(): CampaignDispatchResult["bucketing"] {
  return {
    subscribed: 0,
    unsubscribed: 0,
    cleaned: 0,
    pending: 0,
    not_found: 0,
    suppressed_locally: 0,
  };
}
