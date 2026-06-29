import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/radar-requests
//
// Admin-gated. Returns the full queue:
//   - pending      → research still running (rare; only if a customer
//                    just clicked and the request is in flight)
//   - ready_for_ops → waiting for ops to provision in Otterly + paste
//                     report ID + mark ready
//   - completed     → recent (last 30) for context
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user)) {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  const service = createServiceRoleClient();

  const { data: active } = await service
    .from("radar_setup_requests")
    .select(
      "id, user_id, profile_id, hostname, status, suggested_competitors, suggested_prompts, research_error, ops_notes, requested_at, research_completed_at, platform_profiles ( display_name, full_name, professional_type, brokerage, metro_area, state, target_clients, specializations, property_types, website_url, reply_to_email )",
    )
    .in("status", ["pending", "researching", "ready_for_ops"])
    .order("requested_at", { ascending: true });

  const { data: completed } = await service
    .from("radar_setup_requests")
    .select(
      "id, user_id, profile_id, hostname, status, otterly_report_id, ops_notes, requested_at, completed_at, platform_profiles ( display_name, full_name )",
    )
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(30);

  // Customer change requests (add prompt / add competitor) live in a
  // separate table — surface them in the same queue so ops has one
  // surface to work down.
  const { data: changeActive } = await service
    .from("radar_change_requests")
    .select(
      "id, user_id, profile_id, type, payload, status, ops_notes, requested_at, platform_profiles ( display_name, full_name, website_url )",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const { data: changeCompleted } = await service
    .from("radar_change_requests")
    .select(
      "id, user_id, profile_id, type, payload, status, ops_notes, requested_at, completed_at, platform_profiles ( display_name, full_name )",
    )
    .in("status", ["completed", "rejected"])
    .order("completed_at", { ascending: false })
    .limit(30);

  // Join requester email from auth.users so admin sees who to reach out
  // to if a request looks incomplete.
  const userIds = Array.from(
    new Set([
      ...(active ?? []).map((r) => r.user_id),
      ...(completed ?? []).map((r) => r.user_id),
      ...(changeActive ?? []).map((r) => r.user_id),
      ...(changeCompleted ?? []).map((r) => r.user_id),
    ]),
  );
  const emailById = new Map<string, string | null>();
  for (const id of userIds) {
    const { data } = await service.auth.admin.getUserById(id);
    emailById.set(id, data.user?.email ?? null);
  }

  const decorate = <T extends { user_id: string }>(rows: T[] | null) =>
    (rows ?? []).map((r) => ({
      ...r,
      requester_email: emailById.get(r.user_id) ?? null,
    }));

  return Response.json({
    active: decorate(active),
    completed: decorate(completed),
    changeActive: decorate(changeActive),
    changeCompleted: decorate(changeCompleted),
  });
}
