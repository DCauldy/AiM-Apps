import { createClient } from "@/lib/supabase/server";
import { testWordPressConnection } from "@/lib/blog-engine/cms/wordpress";
import { testWebhookConnection } from "@/lib/blog-engine/cms/webhook";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/blog-engine/cms-connections/test
 * Test a CMS connection by its ID.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { connectionId } = body;

    if (!connectionId) {
      return Response.json(
        { error: "connectionId required" },
        { status: 400 }
      );
    }

    const { data: connection } = await supabase
      .from("bofu_cms_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (!connection) {
      return Response.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    let result: { success: boolean; error?: string; siteName?: string };

    switch (connection.platform) {
      case "wordpress":
        result = await testWordPressConnection(
          connection.wp_site_url,
          connection.wp_username,
          connection.wp_app_password_encrypted
        );
        break;
      case "webhook":
        result = await testWebhookConnection(
          connection.webhook_url,
          connection.webhook_secret
        );
        break;
      default:
        result = { success: false, error: "Unknown platform" };
    }

    // Update last_error on the connection
    if (!result.success && result.error) {
      await supabase
        .from("bofu_cms_connections")
        .update({ last_error: result.error })
        .eq("id", connectionId);
    } else {
      await supabase
        .from("bofu_cms_connections")
        .update({ last_error: null })
        .eq("id", connectionId);
    }

    return Response.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
