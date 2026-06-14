import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

// POST /api/admin/radar-change-requests/[id]
//
// Admin-gated. Body: { action: "complete" | "reject", ops_notes?: string }
// Marks the change request done (or rejected). No customer email yet —
// the customer sees the result on next dashboard load + via the
// "your requests" history list in Settings.
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
    action?: "complete" | "reject";
    ops_notes?: string;
  };
  if (body.action !== "complete" && body.action !== "reject") {
    return Response.json(
      { error: "action must be 'complete' or 'reject'" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: existing } = await service
    .from("radar_change_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return Response.json(
      { error: `Request already ${existing.status}` },
      { status: 409 },
    );
  }

  const { error } = await service
    .from("radar_change_requests")
    .update({
      status: body.action === "complete" ? "completed" : "rejected",
      ops_notes: body.ops_notes ?? null,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return Response.json(
      { error: `update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return Response.json({ status: body.action === "complete" ? "completed" : "rejected" });
}
