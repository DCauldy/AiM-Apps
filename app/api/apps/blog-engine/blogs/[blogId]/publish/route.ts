import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { publishToWordPress } from "@/lib/blog-engine/cms/wordpress";
import { publishToWebhook } from "@/lib/blog-engine/cms/webhook";
import { NextRequest } from "next/server";
import type { BofuBlog, BofuCmsConnection } from "@/types/blog-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/blog-engine/blogs/[blogId]/publish
 * Publish a blog to the user's configured CMS.
 */
export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const { connectionId } = body;

    // Load blog
    const { data: blog } = await supabase
      .from("bofu_blogs")
      .select("*")
      .eq("id", blogId)
      .eq("user_id", user.id)
      .single();

    if (!blog) {
      return Response.json({ error: "Blog not found" }, { status: 404 });
    }

    // Load CMS connection
    let connectionQuery = supabase
      .from("bofu_cms_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (connectionId) {
      connectionQuery = connectionQuery.eq("id", connectionId);
    }

    const { data: connection } = await connectionQuery.maybeSingle();

    if (!connection) {
      return Response.json(
        { error: "No active CMS connection found" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const typedBlog = blog as BofuBlog;
    const typedConnection = connection as BofuCmsConnection;

    // Publish based on platform
    let result: {
      success: boolean;
      postId?: string;
      postUrl?: string;
      error?: string;
    };

    switch (typedConnection.platform) {
      case "wordpress":
        result = await publishToWordPress(typedBlog, typedConnection);
        break;
      case "webhook":
        result = await publishToWebhook(typedBlog, typedConnection);
        break;
      default:
        result = { success: false, error: "Unknown platform" };
    }

    if (result.success) {
      // Update blog with publish info
      await serviceClient
        .from("bofu_blogs")
        .update({
          publish_status: "published",
          cms_connection_id: typedConnection.id,
          cms_post_id: result.postId || null,
          cms_post_url: result.postUrl || null,
          published_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", blogId);

      // Update connection last_publish_at
      await serviceClient
        .from("bofu_cms_connections")
        .update({
          last_publish_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", typedConnection.id);

      return Response.json({
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
      });
    } else {
      // Record error
      await serviceClient
        .from("bofu_blogs")
        .update({
          publish_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", blogId);

      await serviceClient
        .from("bofu_cms_connections")
        .update({ last_error: result.error })
        .eq("id", typedConnection.id);

      return Response.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
