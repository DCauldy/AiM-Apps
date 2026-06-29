import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/blog-engine/encryption";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/blog-engine/cms-connections
 * List user's CMS connections.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: connections } = await supabase
      .from("bofu_cms_connections")
      .select(
        "id, platform, label, wp_site_url, wp_username, wp_default_status, wp_default_category, wp_seo_plugin, webhook_url, is_active, last_publish_at, last_error, created_at"
      )
      .eq("user_id", user.id);

    return Response.json({ connections: connections || [] });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/blog-engine/cms-connections
 * Create a new CMS connection.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { platform, label } = body;

    const serviceClient = createServiceRoleClient();

    const connectionData: Record<string, unknown> = {
      user_id: user.id,
      platform,
      label,
    };

    if (platform === "wordpress") {
      const { wp_site_url, wp_username, wp_app_password, wp_default_status, wp_default_category, wp_seo_plugin } = body;
      connectionData.wp_site_url = wp_site_url;
      connectionData.wp_username = wp_username;
      connectionData.wp_app_password_encrypted = wp_app_password
        ? encrypt(wp_app_password)
        : null;
      connectionData.wp_default_status = wp_default_status || "draft";
      connectionData.wp_default_category = wp_default_category;
      connectionData.wp_seo_plugin = wp_seo_plugin || "none";
    } else if (platform === "webhook") {
      const { webhook_url, webhook_secret } = body;
      connectionData.webhook_url = webhook_url;
      connectionData.webhook_secret = webhook_secret;
    }

    const { data, error } = await serviceClient
      .from("bofu_cms_connections")
      .insert(connectionData)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ connection: data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/apps/blog-engine/cms-connections
 * Delete a CMS connection.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { connectionId } = body;

    const { error } = await supabase
      .from("bofu_cms_connections")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", user.id);

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
