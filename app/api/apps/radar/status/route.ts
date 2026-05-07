import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/status
 * Check if a radar check or audit is currently running for the user.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check for running checks
    const { data: runningCheck } = await supabase
      .from("radar_checks")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "running"])
      .limit(1)
      .maybeSingle();

    // Check for running audits
    const { data: runningAudit } = await supabase
      .from("radar_audits")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "crawling", "analyzing"])
      .limit(1)
      .maybeSingle();

    return Response.json({
      checking: !!runningCheck,
      auditing: !!runningAudit,
    });
  } catch (error: unknown) {
    console.error("Radar status API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
