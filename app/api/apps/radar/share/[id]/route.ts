import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// PATCH /api/apps/radar/share/[id]  body: { is_active?, label? }
// DELETE /api/apps/radar/share/[id]
//
// Owner-only. Revoke (set is_active=false) preserves the row for
// audit; DELETE hard-removes.

interface PatchBody {
  is_active?: boolean;
  label?: string | null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.label === null) updates.label = null;
  else if (typeof body.label === "string")
    updates.label = body.label.trim().slice(0, 80) || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("radar_share_links")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return Response.json(
      { error: `update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return Response.json({ status: "updated" });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { error } = await service
    .from("radar_share_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return Response.json(
      { error: `delete failed: ${error.message}` },
      { status: 500 },
    );
  }
  return Response.json({ status: "deleted" });
}
