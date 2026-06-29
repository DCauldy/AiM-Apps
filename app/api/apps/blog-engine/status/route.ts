import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/status
 * Lightweight polling endpoint for pipeline activity.
 * Returns whether any blogs are currently generating and the total blog count.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check for blogs currently generating
    const { count: generatingCount } = await supabase
      .from("bofu_blogs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("publish_status", "generating");

    // Get total blog count
    const { count: blogCount } = await supabase
      .from("bofu_blogs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return Response.json({
      generating: (generatingCount ?? 0) > 0,
      blogCount: blogCount ?? 0,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
