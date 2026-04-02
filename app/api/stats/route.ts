import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
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

    // First, get user's thread IDs
    const { data: userThreads, error: threadsError } = await supabase
      .from("threads")
      .select("id")
      .eq("user_id", user.id);

    if (threadsError) {
      throw threadsError;
    }

    const threadIds = userThreads?.map((t: any) => t.id) || [];

    // Get user's published prompts (messages where is_public = true and role = 'assistant')
    let publishedMessages: any[] = [];
    if (threadIds.length > 0) {
      const { data: messages, error: publishedError } = await supabase
        .from("messages")
        .select(`
          id,
          title,
          description,
          created_at
        `)
        .eq("is_public", true)
        .eq("role", "assistant")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false });

      if (publishedError) {
        throw publishedError;
      }

      publishedMessages = messages || [];
    }

    const publishedMessageIds = publishedMessages?.map((m: any) => m.id) || [];
    const publishedPromptsCount = publishedMessageIds.length;

    // Get total likes received (upvotes on user's published prompts)
    let totalLikesReceived = 0;
    if (publishedMessageIds.length > 0) {
      const { data: upvotes, error: upvotesError } = await supabase
        .from("prompt_upvotes")
        .select("id")
        .in("message_id", publishedMessageIds);

      if (upvotesError) {
        throw upvotesError;
      }

      totalLikesReceived = upvotes?.length || 0;
    }

    // Get total times saved (saved_prompts entries for user's published prompts)
    let totalTimesSaved = 0;
    if (publishedMessageIds.length > 0) {
      const { data: saved, error: savedError } = await supabase
        .from("saved_prompts")
        .select("id")
        .in("message_id", publishedMessageIds);

      if (savedError) {
        throw savedError;
      }

      totalTimesSaved = saved?.length || 0;
    }

    // Get prompts I've upvoted
    const { data: myUpvotes, error: myUpvotesError } = await supabase
      .from("prompt_upvotes")
      .select("id")
      .eq("user_id", user.id);

    if (myUpvotesError) {
      throw myUpvotesError;
    }

    const promptsIveUpvoted = myUpvotes?.length || 0;

    // Get prompts I've saved
    const { data: mySaved, error: mySavedError } = await supabase
      .from("saved_prompts")
      .select("id")
      .eq("user_id", user.id);

    if (mySavedError) {
      throw mySavedError;
    }

    const promptsIveSaved = mySaved?.length || 0;

    // Get total conversations (threads) - reuse userThreads from earlier
    const totalConversations = userThreads?.length || 0;

    // Get recent activity (user's recently published prompts, limit 10)
    let recentActivity: Array<{
      id: string;
      title: string | null;
      description: string | null;
      upvote_count: number;
      saved_count: number;
      created_at: string;
    }> = [];

    if (publishedMessages && publishedMessages.length > 0) {
      const recentMessageIds = publishedMessages
        .slice(0, 10)
        .map((m: any) => m.id);

      // Get upvote counts for recent messages
      const { data: recentUpvotes } = await supabase
        .from("prompt_upvotes")
        .select("message_id")
        .in("message_id", recentMessageIds);

      const upvoteCounts = new Map<string, number>();
      recentUpvotes?.forEach((upvote) => {
        upvoteCounts.set(
          upvote.message_id,
          (upvoteCounts.get(upvote.message_id) || 0) + 1
        );
      });

      // Get saved counts for recent messages
      const { data: recentSaved } = await supabase
        .from("saved_prompts")
        .select("message_id")
        .in("message_id", recentMessageIds);

      const savedCounts = new Map<string, number>();
      recentSaved?.forEach((saved) => {
        savedCounts.set(
          saved.message_id,
          (savedCounts.get(saved.message_id) || 0) + 1
        );
      });

      // Format recent activity
      recentActivity = publishedMessages.slice(0, 10).map((msg: any) => ({
        id: msg.id,
        title: msg.title || null,
        description: msg.description || null,
        upvote_count: upvoteCounts.get(msg.id) || 0,
        saved_count: savedCounts.get(msg.id) || 0,
        created_at: msg.created_at,
      }));
    }

    return new Response(
      JSON.stringify({
        publishedPromptsCount,
        totalLikesReceived,
        totalTimesSaved,
        promptsIveUpvoted,
        promptsIveSaved,
        totalConversations,
        recentActivity,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Stats GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

