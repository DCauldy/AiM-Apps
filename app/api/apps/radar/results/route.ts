import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/results
 * Get results for a specific check. Filterable by engine and query_id.
 * Query params: check_id (required), engine (optional), query_id (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const checkId = searchParams.get("check_id");
    const engine = searchParams.get("engine");
    const queryId = searchParams.get("query_id");

    if (!checkId) {
      return Response.json(
        { error: "check_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify the check belongs to this user
    const { data: check } = await supabase
      .from("radar_checks")
      .select("id")
      .eq("id", checkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!check) {
      return Response.json({ error: "Check not found" }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from("radar_results")
      .select("*, radar_queries!inner(query_text, category)")
      .eq("check_id", checkId)
      .eq("user_id", user.id);

    if (engine) {
      query = query.eq("engine", engine);
    }

    if (queryId) {
      query = query.eq("query_id", queryId);
    }

    const { data: results, error } = await query.order("created_at", {
      ascending: true,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ results: results || [] });
  } catch (error: unknown) {
    console.error("Radar results GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
