import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/blogs/[blogId]
 * Get a single blog with its versions and chat history.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  try {
    const { blogId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: blog, error } = await supabase
      .from("bofu_blogs")
      .select("*")
      .eq("id", blogId)
      .eq("user_id", user.id)
      .single();

    if (error || !blog) {
      return Response.json({ error: "Blog not found" }, { status: 404 });
    }

    // Fetch versions
    const { data: versions } = await supabase
      .from("bofu_blog_versions")
      .select("*")
      .eq("blog_id", blogId)
      .order("version_number", { ascending: true });

    // Fetch chat history
    const { data: chats } = await supabase
      .from("bofu_blog_chats")
      .select("*")
      .eq("blog_id", blogId)
      .order("created_at", { ascending: true });

    return Response.json({
      blog,
      versions: versions || [],
      chats: chats || [],
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/apps/blog-engine/blogs/[blogId]
 * Update blog fields (meta, status, etc.).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  try {
    const { blogId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Verify ownership
    const { data: existing } = await supabase
      .from("bofu_blogs")
      .select("id")
      .eq("id", blogId)
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      return Response.json({ error: "Blog not found" }, { status: 404 });
    }

    const body = await req.json();
    const { error } = await supabase
      .from("bofu_blogs")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", blogId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
