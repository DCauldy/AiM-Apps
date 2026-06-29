import { createClient } from "@/lib/supabase/server";
import { getBofuUsage } from "@/lib/blog-engine/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/usage
 * Returns current weekly usage status.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const usage = await getBofuUsage(user.id);
    return Response.json({ usage });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
