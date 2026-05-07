import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRadarUsage } from "@/lib/radar/usage";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/queries
 * List tracked queries for the authenticated user.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: queries, error } = await supabase
      .from("radar_queries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ queries: queries || [] });
  } catch (error: unknown) {
    console.error("Radar queries GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/radar/queries
 * Add tracked queries. Accepts either a single query or a batch.
 * Single: { query_text, category?, source? }
 * Batch:  { queries: [{ query_text, category?, source? }, ...] }
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
    const items: Array<{ query_text: string; category?: string; source?: string }> =
      Array.isArray(body.queries) ? body.queries : [body];

    const validItems = items.filter(
      (item) =>
        item.query_text &&
        typeof item.query_text === "string" &&
        item.query_text.trim().length > 0
    );

    if (validItems.length === 0) {
      return Response.json(
        { error: "At least one valid query_text is required" },
        { status: 400 }
      );
    }

    // Check usage against query limit
    const usage = await getRadarUsage(user.id);
    if (usage.queriesUsed + validItems.length > usage.queryLimit) {
      return Response.json(
        {
          error: "query_limit_reached",
          used: usage.queriesUsed,
          limit: usage.queryLimit,
        },
        { status: 429 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const rows = validItems.map((item) => ({
      user_id: user.id,
      query_text: item.query_text.trim(),
      category: item.category || null,
      source: item.source || "manual",
      is_active: true,
    }));

    const { data: queries, error } = await serviceClient
      .from("radar_queries")
      .insert(rows)
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ queries }, { status: 201 });
  } catch (error: unknown) {
    console.error("Radar queries POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/apps/radar/queries
 * Update a query (is_active, category).
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, is_active, category } = body;

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof is_active === "boolean") updates.is_active = is_active;
    if (category !== undefined) updates.category = category;

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { data: query, error } = await serviceClient
      .from("radar_queries")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!query) {
      return Response.json({ error: "Query not found" }, { status: 404 });
    }

    return Response.json({ query });
  } catch (error: unknown) {
    console.error("Radar queries PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/apps/radar/queries
 * Delete a query by id.
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
      .from("radar_queries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    console.error("Radar queries DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
