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

    const { data: threads, error } = await supabase
      .from("threads")
      .select("id, user_id, title, starred, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Normalize starred field to boolean (handle null/undefined as false)
    const normalizedThreads = (threads || []).map((thread: any) => ({
      ...thread,
      starred: thread.starred === true, // Explicitly convert to boolean
    }));

    return new Response(JSON.stringify(normalizedThreads), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Threads GET error:", error);
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

    const { title } = await req.json();
    

    const { data: thread, error } = await supabase
      .from("threads")
      .insert({
        user_id: user.id,
        title: title || "New Conversation",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }


    return new Response(JSON.stringify(thread), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Threads POST error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

