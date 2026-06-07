import { createClient } from "@/lib/supabase/server";
import { setDefaultProfile } from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/[id]/default — mark this profile as the user's default.
 *
 * The default is the profile that becomes active on signin if no other
 * active_profile_id is set. Only one default per user (enforced by partial
 * unique index on platform_profiles).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await setDefaultProfile(user.id, id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to set default";
    return Response.json({ error: message }, { status: 500 });
  }
}
