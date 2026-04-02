import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (content !== undefined && !content.trim()) {
      return new Response(JSON.stringify({ error: "content cannot be empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceClient = createServiceRoleClient();

    const updateData: any = {};
    if (content !== undefined) updateData.content = content.trim();
    if (title !== undefined) updateData.title = title?.trim() || null;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (topic !== undefined) updateData.topic = topic || null;

    const { data: updated, error: updateError } = await serviceClient
      .from("aim_prompts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: "Prompt not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formatted = {
      id: updated.id,
      message_id: updated.id,
      content: updated.content,
      title: updated.title || null,
      description: updated.description || null,
      topic: updated.topic || null,
      user_id: updated.created_by || null,
      author_name: "AiM Academy",
      author_email: null,
      upvote_count: 0,
      has_upvoted: false,
      is_saved: false,
      created_at: updated.created_at,
    };

    return new Response(JSON.stringify(formatted), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("AiM Library PATCH error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const serviceClient = createServiceRoleClient();

    const { error: deleteError } = await serviceClient
      .from("aim_prompts")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return new Response(null, { status: 204 });
  } catch (error: any) {
    console.error("AiM Library DELETE error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
