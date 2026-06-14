import { createClient } from "@/lib/supabase/server";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/usage
 *
 * Returns the current user's Hyperlocal usage status (campaigns this
 * month vs. pack limit, plus the other 3 meters). Used by
 * HyperlocalHeader to render the in-app usage chip + drive the
 * upgrade-modal trigger when limits are hit.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const usage = await getHyperlocalUsage(user.id);
  return Response.json({ usage });
}
