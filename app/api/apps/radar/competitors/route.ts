import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/competitors
 * List competitors for the authenticated user.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: competitors, error } = await supabase
      .from("radar_competitors")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ competitors: competitors || [] });
  } catch (error: unknown) {
    console.error("Radar competitors GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/radar/competitors
 * Add competitors. Accepts either a single or batch.
 * Single: { name, website_url? }
 * Batch:  { competitors: [{ name, website_url? }, ...] }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Normalize to array
    const items: Array<{ name: string; website_url?: string }> =
      Array.isArray(body.competitors) ? body.competitors : [body];

    const validItems = items.filter(
      (item) =>
        item.name &&
        typeof item.name === "string" &&
        item.name.trim().length > 0
    );

    if (validItems.length === 0) {
      return Response.json(
        { error: "At least one valid name is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const rows = validItems.map((item) => ({
      user_id: user.id,
      name: item.name.trim(),
      website_url: item.website_url || null,
    }));

    const { data: competitors, error } = await serviceClient
      .from("radar_competitors")
      .insert(rows)
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ competitors }, { status: 201 });
  } catch (error: unknown) {
    console.error("Radar competitors POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/apps/radar/competitors
 * Delete a competitor by id.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { error } = await serviceClient
      .from("radar_competitors")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    console.error("Radar competitors DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
