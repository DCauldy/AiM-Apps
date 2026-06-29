import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { sendCustomerRadarReadyEmail } from "@/lib/radar-otterly/email";

export const dynamic = "force-dynamic";

// POST /api/admin/radar-requests/[id]/complete
//
// Admin-gated. Marks a setup request as completed, links the Otterly
// brand report ID, fires the customer "your Radar is live" email.
//
// Body: { otterly_report_id: string, ops_notes?: string }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user)) {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    otterly_report_id?: string;
    ops_notes?: string;
  };
  const reportId = body.otterly_report_id?.trim();
  if (!reportId) {
    return Response.json(
      { error: "otterly_report_id is required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Fetch the row + the requester's profile so we can send the email
  // with their name + the original hostname.
  const { data: request } = await service
    .from("radar_setup_requests")
    .select(
      "id, user_id, hostname, status, platform_profiles ( display_name, full_name, reply_to_email )",
    )
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status === "completed") {
    return Response.json(
      { error: "Request already completed" },
      { status: 409 },
    );
  }

  const { error: updateError } = await service
    .from("radar_setup_requests")
    .update({
      status: "completed",
      otterly_report_id: reportId,
      ops_notes: body.ops_notes ?? null,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    return Response.json(
      { error: `DB update failed: ${updateError.message}` },
      { status: 500 },
    );
  }

  // Pull the requester's email from auth.users (the profile may not
  // have reply_to_email set — auth email is the reliable contact).
  const { data: requesterAuth } = await service.auth.admin.getUserById(
    request.user_id,
  );
  const toEmail =
    requesterAuth.user?.email ??
    (request.platform_profiles as { reply_to_email?: string | null } | null)
      ?.reply_to_email ??
    null;

  if (toEmail) {
    try {
      const profile = request.platform_profiles as {
        display_name?: string | null;
        full_name?: string | null;
      } | null;
      await sendCustomerRadarReadyEmail({
        toEmail,
        toName: profile?.display_name ?? profile?.full_name ?? null,
        hostname: request.hostname,
      });
    } catch (e) {
      // Email is best-effort — the request is marked complete and the
      // dashboard will auto-flip on next load even if the email fails.
      // Surface the error in the response so ops knows to follow up
      // manually.
      return Response.json({
        status: "completed",
        email_sent: false,
        email_error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return Response.json({ status: "completed", email_sent: !!toEmail });
}
