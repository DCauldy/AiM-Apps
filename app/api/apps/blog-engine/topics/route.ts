import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/topics
 * List user's topic bank with filtering.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Reset any "writing" topics whose pipeline is no longer running.
    // Check if there are any blogs currently "generating" for this user.
    const { data: generatingBlogs } = await supabase
      .from("bofu_blogs")
      .select("id")
      .eq("user_id", user.id)
      .eq("publish_status", "generating")
      .limit(1);

    if (!generatingBlogs || generatingBlogs.length === 0) {
      // No active pipeline — reset any stuck "writing" topics
      await supabase
        .from("bofu_topics")
        .update({ status: "unused" })
        .eq("user_id", user.id)
        .eq("status", "writing");
    }

    let query = supabase
      .from("bofu_topics")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("user_priority", { ascending: true, nullsFirst: false })
      .order("bofu_score", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: topics, count, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ topics: topics || [], total: count || 0 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/apps/blog-engine/topics
 * Update a topic's status (skip, etc.).
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // Reorder action: bulk update user_priority from ordered ID array
    if (action === "reorder") {
      const { orderedIds } = body as { action: string; orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return Response.json(
          { error: "orderedIds array required" },
          { status: 400 }
        );
      }

      // Update each topic's user_priority based on its index
      const updates = orderedIds.map((id, index) =>
        supabase
          .from("bofu_topics")
          .update({ user_priority: index + 1 })
          .eq("id", id)
          .eq("user_id", user.id)
      );

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        return Response.json({ error: failed.error.message }, { status: 500 });
      }

      return Response.json({ success: true });
    }

    // Default: update topic status
    const { topicId, status } = body;

    if (!topicId || !status) {
      return Response.json(
        { error: "topicId and status required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("bofu_topics")
      .update({ status })
      .eq("id", topicId)
      .eq("user_id", user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
