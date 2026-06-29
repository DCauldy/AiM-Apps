import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/welcome/dismiss
 *
 * Stamps profiles.welcome_dismissed_at for the current user. Fired
 * when the user closes the /apps welcome modal without setting up
 * a profile — so the modal stays gone on every device, not just
 * the current browser.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("profiles")
    .update({ welcome_dismissed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
