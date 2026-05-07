import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/alerts
 * List alerts for the authenticated user (unread first, then by created_at desc).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: alerts, error } = await supabase
      .from("radar_alerts")
      .select("*")
      .eq("user_id", user.id)
      .order("read", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ alerts: alerts || [] });
  } catch (error: unknown) {
    console.error("Radar alerts GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/apps/radar/alerts
 * Mark alert(s) as read. Body: { alertIds: string[] }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { alertIds } = body;

    if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
      return Response.json(
        { error: "alertIds array is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { error } = await serviceClient
      .from("radar_alerts")
      .update({ read: true })
      .in("id", alertIds)
      .eq("user_id", user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, updated: alertIds.length });
  } catch (error: unknown) {
    console.error("Radar alerts PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
