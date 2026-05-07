import { createClient } from "@/lib/supabase/server";
import { getRadarUsage } from "@/lib/radar/usage";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/usage
 * Return current usage stats for the authenticated user.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const usage = await getRadarUsage(user.id);

    return Response.json({ usage });
  } catch (error: unknown) {
    console.error("Radar usage API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
