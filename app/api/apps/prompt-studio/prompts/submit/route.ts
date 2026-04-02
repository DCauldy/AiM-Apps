import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { content, title, description, topic } = await req.json();

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: "Content is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceClient = createServiceRoleClient();

    // Get or create a hidden submissions thread for this user
    const { data: existingThread } = await serviceClient
      .from("threads")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", "__direct_submissions__")
      .maybeSingle();

    let threadId: string;

    if (existingThread) {
      threadId = existingThread.id;
    } else {
      const { data: newThread, error: threadError } = await serviceClient
        .from("threads")
        .insert({ user_id: user.id, title: "__direct_submissions__" })
        .select("id")
        .single();

      if (threadError || !newThread) {
        throw threadError || new Error("Failed to create submissions thread");
      }

      threadId = newThread.id;
    }

    // Insert the message
    const { data: message, error: messageError } = await serviceClient
      .from("messages")
      .insert({
        thread_id: threadId,
        role: "assistant",
        content: content.trim(),
        is_public: true,
        title: title?.trim() || null,
        description: description?.trim() || null,
        topic: topic || null,
      })
      .select("id, content, title, description, topic, created_at")
      .single();

    if (messageError || !message) {
      throw messageError || new Error("Failed to insert message");
    }

    // Fetch author profile
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const newPrompt = {
      id: message.id,
      message_id: message.id,
      content: message.content,
      title: message.title || null,
      description: message.description || null,
      topic: message.topic || null,
      user_id: user.id,
      author_name: profile?.full_name || null,
      author_email: profile?.email || null,
      upvote_count: 0,
      has_upvoted: false,
      is_saved: false,
      created_at: message.created_at,
    };

    return new Response(JSON.stringify(newPrompt), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Submit prompt error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
