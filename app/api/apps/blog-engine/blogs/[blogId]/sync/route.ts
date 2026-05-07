import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncToWordPress } from "@/lib/blog-engine/cms/wordpress";
import { syncToWebhook } from "@/lib/blog-engine/cms/webhook";
import { NextRequest } from "next/server";
import type { BofuBlog, BofuCmsConnection } from "@/types/blog-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/blog-engine/blogs/[blogId]/sync
 * Sync refined blog content back to the CMS (updates the existing post).
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

    const typedBlog = blog as BofuBlog;

    // Guard: must be published with a CMS connection
    if (typedBlog.publish_status !== "published") {
      return Response.json(
        { error: "Blog must be published before syncing" },
        { status: 400 }
      );
    }

    if (!typedBlog.cms_connection_id) {
      return Response.json(
        { error: "No CMS connection associated with this blog" },
        { status: 400 }
      );
    }

    // Load the CMS connection used at publish time
    const { data: connection } = await supabase
      .from("bofu_cms_connections")
      .select("*")
      .eq("id", typedBlog.cms_connection_id)
      .eq("user_id", user.id)
      .single();

    if (!connection) {
      return Response.json(
        { error: "CMS connection not found" },
        { status: 404 }
      );
    }

    const typedConnection = connection as BofuCmsConnection;
    const serviceClient = createServiceRoleClient();

    // Dispatch sync based on platform
    let result: {
      success: boolean;
      postId?: string;
      postUrl?: string;
      error?: string;
    };

    switch (typedConnection.platform) {
      case "wordpress":
        result = await syncToWordPress(typedBlog, typedConnection);
        break;
      case "webhook":
        result = await syncToWebhook(typedBlog, typedConnection);
        break;
      default:
        result = { success: false, error: "Unknown platform" };
    }

    if (result.success) {
      const syncedAt = new Date().toISOString();

      // Update blog with sync timestamp (does NOT change publish_status or published_at)
      await serviceClient
        .from("bofu_blogs")
        .update({
          synced_at: syncedAt,
          cms_post_url: result.postUrl || typedBlog.cms_post_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", blogId);

      // Clear any previous connection error
      await serviceClient
        .from("bofu_cms_connections")
        .update({ last_error: null })
        .eq("id", typedConnection.id);

      return Response.json({
        success: true,
        postUrl: result.postUrl || typedBlog.cms_post_url,
        syncedAt,
      });
    } else {
      // Record error on connection
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
