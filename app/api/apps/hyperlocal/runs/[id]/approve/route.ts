import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { triggerSend } from "@/lib/hyperlocal/run-pipeline";
import {
  checkRunLaunchCompliance,
  type ComplianceIssue,
} from "@/lib/hyperlocal/email/compliance";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/runs/:id/approve
 * Approve all drafts (or only the ones already approved) and trigger Phase 3.
 * Body: { approve_all?: boolean } — defaults to true
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const approveAll = body.approve_all !== false;

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, phase, email_connection_id, profile_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  if (run.phase !== "review") {
    return Response.json(
      { error: `Run is in ${run.phase} phase, not review` },
      { status: 400 }
    );
  }
  if (!run.email_connection_id) {
    return Response.json(
      { error: "No email connection chosen for this run — set one before approving" },
      { status: 400 }
    );
  }
  if (!run.profile_id) {
    return Response.json(
      { error: "No profile attached to this run — set one before approving" },
      { status: 400 }
    );
  }

  // ---- Compliance gate: refuse to launch a non-compliant run ----
  const [{ data: profile }, { data: connection }, { data: recipients }] =
    await Promise.all([
      service
        .from("platform_profiles")
        .select(
          "physical_address, license_number, brokerage, license_info, state"
        )
        .eq("id", run.profile_id)
        .maybeSingle(),
      service
        .from("hl_email_connections")
        .select("is_active, paused, resend_dkim_status")
        .eq("id", run.email_connection_id)
        .maybeSingle(),
      service
        .from("hl_recipients")
        .select("contact_email, unsubscribe_token, hl_emails!inner(run_id)")
        .eq("hl_emails.run_id", id),
    ]);
  if (!profile) {
    return Response.json(
      { error: "Profile attached to this run no longer exists" },
      { status: 400 }
    );
  }
  if (!connection) {
    return Response.json(
      { error: "Email connection attached to this run no longer exists" },
      { status: 400 }
    );
  }
  const issues: ComplianceIssue[] = checkRunLaunchCompliance({
    profile,
    connection,
    recipients: (recipients ?? []).map((r) => ({
      contact_email: r.contact_email,
      unsubscribe_token: r.unsubscribe_token,
    })),
  });
  if (issues.length > 0) {
    return Response.json(
      {
        error: "Run cannot be launched — fix the compliance issues below",
        issues,
      },
      { status: 400 }
    );
  }

  if (approveAll) {
    await service
      .from("hl_emails")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("run_id", id)
      .eq("status", "draft");
  }

  // Confirm at least one approved email exists
  const { count } = await service
    .from("hl_emails")
    .select("*", { count: "exact", head: true })
    .eq("run_id", id)
    .eq("status", "approved");
  if (!count) {
    return Response.json(
      { error: "No approved emails — review and approve at least one first" },
      { status: 400 }
    );
  }

  await service
    .from("hl_runs")
    .update({ phase: "sending", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    await triggerSend(id);
  } catch (e) {
    await service
      .from("hl_runs")
      .update({
        phase: "failed",
        error: e instanceof Error ? e.message : "Failed to trigger send",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return Response.json(
      { error: "Failed to trigger send pipeline" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, approved_count: count });
}
