import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(
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

    // Get message and verify it belongs to user's thread
    const { data: message, error } = await supabase
      .from("messages")
      .select(`
        id,
        thread_id,
        role,
        content,
        is_public,
        title,
        description,
        topic,
        created_at,
        threads!inner(user_id)
      `)
      .eq("id", messageId)
      .single();

    if (error || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify message belongs to user
    if ((message as any).threads.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return message without the threads relation
    const { threads, ...messageData } = message as any;
    return new Response(JSON.stringify(messageData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Message GET by ID error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
