import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    .select("phase")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  if (run.phase === "completed") {
    return Response.json({ error: "Run already completed" }, { status: 400 });
  }

  // Halt any queued send jobs for this run's recipients (best-effort).
  const { data: recipients } = await service
    .from("hl_recipients")
    .select("id, email_id, hl_emails!inner(run_id)")
    .eq("hl_emails.run_id", id);
  const recipientIds = (recipients ?? []).map((r) => r.id);
  if (recipientIds.length > 0) {
    await service
      .from("hl_send_jobs")
      .update({ status: "failed", last_error: "Run cancelled" })
      .in("recipient_id", recipientIds)
      .eq("status", "queued");
  }

  await service
    .from("hl_runs")
    .update({
      phase: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  return Response.json({ success: true });
}
