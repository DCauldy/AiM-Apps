import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/admin-config.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/app-availability
 * Returns which apps are currently enabled by admin.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getFeatureFlags();

  return Response.json({
    apps: {
      "prompt-studio": flags["PROMPT_STUDIO"] !== false,
      "blog-engine": flags["BLOG_ENGINE"] === true,
      "radar": flags["RADAR"] === true,
      "hyperlocal": flags["HYPERLOCAL"] === true,
      "listing-studio": flags["LISTING_STUDIO"] === true,
    },
  });
}
