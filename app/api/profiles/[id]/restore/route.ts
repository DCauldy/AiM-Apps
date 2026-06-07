import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { canCreateProfile } from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/[id]/restore — un-archive a previously archived profile.
 *
 * Slot-gated — the restore counts as occupying a slot, so if the user is
 * already at slot capacity with active profiles, the restore is rejected.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const capacity = await canCreateProfile(user.id);
  if (!capacity.allowed) {
    return Response.json(
      { error: capacity.reason, slotCount: capacity.slotCount, activeCount: capacity.activeCount },
      { status: 402 }
    );
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .not("archived_at", "is", null)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Profile not found or not archived" }, { status: 404 });

  return Response.json({ profile: data });
}
