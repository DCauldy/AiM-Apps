import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") || "recent";

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const serviceClient = createServiceRoleClient();

    // Fetch all AiM prompts — all subscribers see the full library
    const query = serviceClient
      .from("aim_prompts")
      .select("id, content, title, description, topic, created_by, created_at, author_name")
      .order("created_at", { ascending: false });

    const { data: prompts, error: promptsError } = await query;

    if (promptsError) {
      throw promptsError;
    }

    if (!prompts || prompts.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const promptIds = prompts.map((p: any) => p.id);

    // Get upvote counts
    const { data: upvotes } = await serviceClient
      .from("aim_prompt_upvotes")
      .select("aim_prompt_id")
      .in("aim_prompt_id", promptIds);

    const upvoteCounts = new Map<string, number>();
    upvotes?.forEach((u: any) => {
      upvoteCounts.set(u.aim_prompt_id, (upvoteCounts.get(u.aim_prompt_id) || 0) + 1);
    });

    // Get current user's upvotes and saves
    const userUpvoteSet = new Set<string>();
    const userSavedSet = new Set<string>();

    if (user) {
      const [userUpvotesRes, userSavedRes] = await Promise.all([
        supabase
          .from("aim_prompt_upvotes")
          .select("aim_prompt_id")
          .eq("user_id", user.id)
          .in("aim_prompt_id", promptIds),
        supabase
          .from("aim_saved_prompts")
          .select("aim_prompt_id")
          .eq("user_id", user.id)
          .in("aim_prompt_id", promptIds),
      ]);

      userUpvotesRes.data?.forEach((u: any) => userUpvoteSet.add(u.aim_prompt_id));
      userSavedRes.data?.forEach((s: any) => userSavedSet.add(s.aim_prompt_id));
    }

    const formatted = prompts.map((p: any) => ({
      id: p.id,
      message_id: p.id,
      content: p.content,
      title: p.title || null,
      description: p.description || null,
      topic: p.topic || null,
      user_id: p.created_by || null,
      author_name: p.author_name || "AiM Prompts",
      author_email: null,
      upvote_count: upvoteCounts.get(p.id) || 0,
      has_upvoted: userUpvoteSet.has(p.id),
      is_saved: userSavedSet.has(p.id),
      created_at: p.created_at,
    }));

    if (sort === "popular") {
      formatted.sort((a: any, b: any) => b.upvote_count - a.upvote_count);
    }

    return new Response(JSON.stringify(formatted), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("AiM Library GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isAdminUser(user)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { content, title, description, topic } = body;

    if (!content?.trim()) {
      return new Response(JSON.stringify({ error: "content is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceClient = createServiceRoleClient();

    const { data: prompt, error: insertError } = await serviceClient
      .from("aim_prompts")
      .insert({
        content: content.trim(),
        title: title?.trim() || null,
        description: description?.trim() || null,
        topic: topic || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    const formatted = {
      id: prompt.id,
      message_id: prompt.id,
      content: prompt.content,
      title: prompt.title || null,
      description: prompt.description || null,
      topic: prompt.topic || null,
      user_id: prompt.created_by || null,
      author_name: "AiM Prompts",
      author_email: null,
      upvote_count: 0,
      has_upvoted: false,
      is_saved: false,
      created_at: prompt.created_at,
    };

    return new Response(JSON.stringify(formatted), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("AiM Library POST error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
