import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { setActiveProfile } from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/[id]/activate — set this profile as the user's active context.
 *
 * Rejects if the profile is archived or doesn't belong to the user.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: profile, error } = await service
    .from("platform_profiles")
    .select("id, archived_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  if (profile.archived_at) {
    return Response.json({ error: "Cannot activate an archived profile" }, { status: 400 });
  }

  await setActiveProfile(user.id, id);
  return Response.json({ ok: true, active_profile_id: id });
}
