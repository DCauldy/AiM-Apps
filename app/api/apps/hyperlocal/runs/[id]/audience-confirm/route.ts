import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchCampaignRun } from "@/lib/hyperlocal/email/campaign-dispatch";
import { getAdapter } from "@/lib/hyperlocal/email/providers/registry";
import type { HlEmailConnection } from "@/types/hyperlocal";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/runs/:id/audience-confirm
 *
 * Dry-run audience lookup — returns the bucketing + new-contact list
 * without committing anything. The review-screen banner calls this to
 * show "23 will be added if you approve" before the user clicks.
 */
export async function GET(
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
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, email_connection_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run?.email_connection_id) {
    return Response.json({ error: "Run not found or has no connection" }, { status: 404 });
  }

  const { data: conn } = await service
    .from("hl_email_connections")
    .select("*")
    .eq("id", run.email_connection_id)
    .single();
  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  const adapter = getAdapter(conn.provider);
  if (adapter.mode !== "campaign" || !adapter.lookupContacts) {
    return Response.json(
      { error: "This provider doesn't need audience confirmation" },
      { status: 400 },
    );
  }

  const { data: recipients } = await service
    .from("hl_recipients")
    .select("contact_email, hl_emails!inner(run_id)")
    .eq("hl_emails.run_id", id)
    .eq("send_status", "pending");
  if (!recipients || recipients.length === 0) {
    return Response.json({
      bucketing: {
        subscribed: 0,
        unsubscribed: 0,
        cleaned: 0,
        pending: 0,
        not_found: 0,
      },
      new_contacts: [],
      audience_name:
        (conn.provider_metadata as { mailchimp?: { audience_name?: string } })
          ?.mailchimp?.audience_name ?? null,
    });
  }

  const lookup = await adapter.lookupContacts(
    conn as HlEmailConnection,
    recipients.map((r) => r.contact_email),
  );
  const buckets = { subscribed: 0, unsubscribed: 0, cleaned: 0, pending: 0, not_found: 0 };
  const newContacts: string[] = [];
  for (const row of lookup.rows) {
    const state = row.status.state;
    if (state === "subscribed") buckets.subscribed += 1;
    else if (state === "unsubscribed") buckets.unsubscribed += 1;
    else if (state === "cleaned") buckets.cleaned += 1;
    else if (state === "pending") buckets.pending += 1;
    else {
      buckets.not_found += 1;
      newContacts.push(row.email);
    }
  }

  return Response.json({
    bucketing: buckets,
    new_contacts: newContacts,
    audience_name:
      (conn.provider_metadata as { mailchimp?: { audience_name?: string } })
        ?.mailchimp?.audience_name ?? null,
  });
}

/**
 * POST /api/apps/hyperlocal/runs/:id/audience-confirm
 * Body: { action: "approve" | "skip_new" }
 *
 * Called from the review-screen banner when a campaign-mode run is parked
 * in awaiting_audience_confirmation. Approve adds the new contacts to the
 * agent's audience (affects their ESP billing) and re-fires dispatch. Skip
 * sends only to contacts already in the audience.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== "approve" && action !== "skip_new") {
    return Response.json(
      { error: "action must be 'approve' or 'skip_new'" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, email_connection_id, phase")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.phase !== "awaiting_audience_confirmation") {
    return Response.json(
      { error: `Run is in ${run.phase}, not awaiting_audience_confirmation` },
      { status: 400 },
    );
  }
  if (!run.email_connection_id) {
    return Response.json(
      { error: "Run has no email connection" },
      { status: 400 },
    );
  }

  const { data: conn } = await service
    .from("hl_email_connections")
    .select("*")
    .eq("id", run.email_connection_id)
    .single();
  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  // `skip_new` is implemented as: temporarily mark the not-found recipients
  // as "suppressed" for this run so dispatchCampaignRun's lookup excludes
  // them. We do that inline, then re-dispatch with audienceApproved=true so
  // the bucket logic doesn't park again.
  if (action === "skip_new") {
    // Mark recipients whose email isn't in the audience as locally suppressed
    // for this run only. The simplest implementation: flip their send_status
    // to "suppressed". They won't be picked up by the campaign-dispatch loop.
    //
    // We figure out which recipients are "not in audience" by re-running the
    // lookup — duplicated work but keeps the API thin. For a busier system
    // we'd cache the bucketing result from the first pass.
    const { getAdapter } = await import("@/lib/hyperlocal/email/providers/registry");
    const adapter = getAdapter(conn.provider);
    if (adapter.mode === "campaign" && adapter.lookupContacts) {
      const { data: recipients } = await service
        .from("hl_recipients")
        .select(
          "id, contact_email, hl_emails!inner(run_id)",
        )
        .eq("hl_emails.run_id", id)
        .eq("send_status", "pending");
      if (recipients) {
        const lookup = await adapter.lookupContacts(
          conn as HlEmailConnection,
          recipients.map((r) => r.contact_email),
        );
        const subscribed = new Set(
          lookup.rows
            .filter((r) => r.status.state === "subscribed")
            .map((r) => r.email.toLowerCase()),
        );
        const skipIds = recipients
          .filter((r) => !subscribed.has(r.contact_email.toLowerCase()))
          .map((r) => r.id);
        if (skipIds.length > 0) {
          await service
            .from("hl_recipients")
            .update({ send_status: "suppressed" })
            .in("id", skipIds);
        }
      }
    }
  }

  // Re-dispatch with audienceApproved=true (always, since we either approved
  // adding new contacts OR removed them from the pool just above).
  const result = await dispatchCampaignRun({
    supabase: service,
    runId: id,
    connection: conn as HlEmailConnection,
    audienceApproved: true,
  });

  return Response.json({
    ok: true,
    action,
    outcome: result.outcome,
    campaign_id: result.campaign_id,
    bucketing: result.bucketing,
  });
}
