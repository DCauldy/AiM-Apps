import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/config
 * Return the radar_config for the authenticated user.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: config, error } = await supabase
      .from("radar_config")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ config: config || null });
  } catch (error: unknown) {
    console.error("Radar config GET error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/radar/config
 * Create (upsert) the radar_config for the authenticated user.
 * Used during onboarding to initialize the config row.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const serviceClient = createServiceRoleClient();
    const { data: config, error } = await serviceClient
      .from("radar_config")
      .upsert(
        {
          user_id: user.id,
          brand_variations: body.brand_variations || [],
          monitored_engines: body.monitored_engines || [
            "chatgpt",
            "perplexity",
            "gemini",
            "claude",
            "grok",
            "google_aio",
            "google_ai_mode",
            "copilot",
          ],
          monitoring_frequency: body.monitoring_frequency || "monthly",
          onboarding_completed: body.onboarding_completed ?? false,
          tier: "pro",
          query_limit: 25,
          manual_checks_limit: 2,
          audits_limit: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ config }, { status: 201 });
  } catch (error: unknown) {
    console.error("Radar config POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/apps/radar/config
 * Update radar_config fields for the authenticated user.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Allowlist of updatable fields
    const allowedFields = [
      "brand_variations",
      "monitored_engines",
      "monitoring_frequency",
      "onboarding_completed",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const serviceClient = createServiceRoleClient();
    const { data: config, error } = await serviceClient
      .from("radar_config")
      .update(updates)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!config) {
      return Response.json({ error: "Config not found" }, { status: 404 });
    }

    return Response.json({ config });
  } catch (error: unknown) {
    console.error("Radar config PUT error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
