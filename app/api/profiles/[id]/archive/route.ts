import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSlotState, setActiveProfile } from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/[id]/archive — soft archive a profile.
 *
 * Apps under an archived profile become inaccessible but data is preserved.
 * If the archived profile was the user's active one, the active pointer is
 * advanced to their default-or-oldest remaining active profile.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();

  // Don't allow archiving your last active profile
  const { count } = await service
    .from("platform_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("archived_at", null);

  if ((count ?? 0) <= 1) {
    return Response.json(
      { error: "Cannot archive your last active profile. Create another first or delete this one." },
      { status: 400 }
    );
  }

  const { data, error } = await service
    .from("platform_profiles")
    .update({
      archived_at: new Date().toISOString(),
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // If user was operating on this profile, advance to next active profile
  const slot = await getSlotState(user.id);
  if (slot.active_profile_id === id) {
    const { data: next } = await service
      .from("platform_profiles")
      .select("id")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) await setActiveProfile(user.id, next.id);
  }

  return Response.json({ profile: data });
}
