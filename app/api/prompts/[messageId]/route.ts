import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
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

    const body = await req.json();
    const { is_public, title, description, topic } = body;

    // Verify message belongs to user's thread and get role
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select(
        `
        id,
        thread_id,
        role,
        threads!inner(user_id)
      `
      )
      .eq("id", messageId)
      .single();

    if (messageError || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if ((message as any).threads.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log message role for debugging
    console.log("Message role check:", {
      messageId,
      role: (message as any).role,
      isAssistant: (message as any).role === "assistant"
    });

    // Update message
    const updateData: any = {};
    if (is_public !== undefined) updateData.is_public = is_public;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (topic !== undefined) updateData.topic = topic;

    console.log("=== MAKE PUBLIC API DEBUG ===");
    console.log("Updating message:", {
      messageId,
      updateData,
      userId: user.id
    });

    const { data: updatedMessage, error: updateError } = await supabase
      .from("messages")
      .update(updateData)
      .eq("id", messageId)
      .select("id, is_public, role, thread_id, content, title, description, topic")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    console.log("Update successful:", {
      messageId: updatedMessage?.id,
      is_public: updatedMessage?.is_public,
      role: updatedMessage?.role,
      thread_id: updatedMessage?.thread_id,
      contentLength: updatedMessage?.content?.length
    });
    console.log("=============================");

    return new Response(JSON.stringify(updatedMessage), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Prompt PATCH error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

