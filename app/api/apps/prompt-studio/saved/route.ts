import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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

    const { data: savedPrompts, error } = await supabase
      .from("saved_prompts")
      .select("id, message_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    if (!savedPrompts || savedPrompts.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messageIds = savedPrompts.map((sp: any) => sp.message_id);

    if (messageIds.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get messages - use service role client to bypass RLS for public messages
    const serviceClient = createServiceRoleClient();
    
    const { data: messages, error: messagesError } = await serviceClient
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
      .in("id", messageIds);

    if (messagesError) {
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get thread user_ids using service role client
    const threadIds = [...new Set(messages.map((m: any) => m.thread_id).filter(Boolean))];
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
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    const profileMap = new Map(
      profiles?.map((p: any) => [p.id, p]) || []
    );

    const messageMap = new Map(
      messages?.map((m: any) => [m.id, m]) || []
    );

    // Get upvote counts using service role client
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
    const userUpvotes = await serviceClient
      .from("prompt_upvotes")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", messageIds);

    const userUpvoteSet = new Set(
      userUpvotes.data?.map((u: any) => u.message_id) || []
    );

    const formatted = savedPrompts?.map((saved: any) => {
      const message = messageMap.get(saved.message_id);
      const messageUserId = message ? threadMap.get(message.thread_id) : null;
      const profile = messageUserId ? profileMap.get(messageUserId) : null;
      return {
        id: saved.id,
        message_id: saved.message_id,
        user_id: user.id,
        created_at: saved.created_at,
        prompt: message
          ? {
              id: message.id,
              message_id: message.id,
              content: message.content,
              title: message.title || null,
              description: message.description || null,
              topic: message.topic || null,
              user_id: messageUserId,
              author_name: profile?.full_name || null,
              author_email: profile?.email || null,
              upvote_count: upvoteCounts.get(message.id) || 0,
              has_upvoted: userUpvoteSet.has(message.id),
              is_saved: true,
              created_at: message.created_at,
            }
          : null,
      };
    });

    return new Response(JSON.stringify(formatted || []), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Saved prompts GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
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

    const { messageId } = await req.json();

    if (!messageId) {
      return new Response(JSON.stringify({ error: "messageId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from("saved_prompts")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Remove from saved
      const { error: deleteError } = await supabase
        .from("saved_prompts")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      return new Response(JSON.stringify({ saved: false }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Add to saved
      const { data: saved, error: insertError } = await supabase
        .from("saved_prompts")
        .insert({
          message_id: messageId,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return new Response(JSON.stringify({ saved: true, savedPrompt: saved }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Saved prompt POST error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

