import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") || "recent"; // recent, popular
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get current user if authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Block standalone users from Community Prompts
    if (user) {
      const serviceClient = createServiceRoleClient();
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single();

      if (profile?.account_type === "standalone") {
        return new Response(
          JSON.stringify({ error: "Community Prompts are available to AiM members" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Get public prompts - RLS policy allows anyone to view public messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select(`
        id,
        content,
        title,
        description,
        topic,
        created_at,
        is_public,
        role,
        thread_id
      `)
      .eq("is_public", true)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (messagesError) {
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messageIds = messages.map((m: any) => m.id);
    const threadIds = [...new Set(messages.map((m: any) => m.thread_id).filter(Boolean))];

    // Use service role client to bypass RLS and get thread user_ids
    // This is safe because we only need user_id for public messages
    const serviceClient = createServiceRoleClient();

    const { data: threads } = await serviceClient
      .from("threads")
      .select("id, user_id")
      .in("id", threadIds);

    const threadMap = new Map(
      threads?.map((t: any) => [t.id, t.user_id]) || []
    );

    const userIds = [...new Set(
      messages
        .map((m: any) => threadMap.get(m.thread_id))
        .filter(Boolean)
    )];

    // Get author info using service role client to bypass RLS
    // This is safe because we only need profile info for public messages
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    const profileMap = new Map(
      profiles?.map((p: any) => [p.id, p]) || []
    );

    // Get upvote counts using service role client to bypass RLS
    // The "Anyone can view upvotes" policy should work, but using service role ensures consistency
    const { data: upvotes } = await serviceClient
      .from("prompt_upvotes")
      .select("message_id")
      .in("message_id", messageIds);

    const upvoteCounts = new Map<string, number>();
    upvotes?.forEach((upvote) => {
      upvoteCounts.set(
        upvote.message_id,
        (upvoteCounts.get(upvote.message_id) || 0) + 1
      );
    });

    // Get user's upvotes if authenticated
    const userUpvotes = user
      ? await supabase
          .from("prompt_upvotes")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", messageIds)
      : { data: [] };

    const userUpvoteSet = new Set(
      userUpvotes.data?.map((u: any) => u.message_id) || []
    );

    // Get user's saved prompts if authenticated
    const userSaved = user
      ? await supabase
          .from("saved_prompts")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", messageIds)
      : { data: [] };

    const userSavedSet = new Set(
      userSaved.data?.map((s: any) => s.message_id) || []
    );

    // Format response
    const prompts = messages.map((msg: any) => {
      const userId = threadMap.get(msg.thread_id);
      const profile = profileMap.get(userId);
      return {
        id: msg.id,
        message_id: msg.id,
        content: msg.content,
        title: msg.title || null,
        description: msg.description || null,
        topic: msg.topic || null,
        user_id: userId,
        author_name: profile?.full_name || null,
        author_email: profile?.email || null,
        upvote_count: upvoteCounts.get(msg.id) || 0,
        has_upvoted: userUpvoteSet.has(msg.id),
        is_saved: userSavedSet.has(msg.id),
        created_at: msg.created_at,
      };
    });

    // Sort by popularity if requested
    if (sort === "popular") {
      prompts.sort((a, b) => b.upvote_count - a.upvote_count);
    }

    return new Response(JSON.stringify(prompts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Library GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
