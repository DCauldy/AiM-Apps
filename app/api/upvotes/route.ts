import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

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

    // Check if already upvoted
    const { data: existing } = await supabase
      .from("prompt_upvotes")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Remove upvote
      const { error: deleteError } = await supabase
        .from("prompt_upvotes")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      return new Response(JSON.stringify({ upvoted: false }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Add upvote
      const { data: upvote, error: insertError } = await supabase
        .from("prompt_upvotes")
        .insert({
          message_id: messageId,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return new Response(JSON.stringify({ upvoted: true, upvote }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Upvote POST error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

