import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRadarQueryDiscoveryModel } from "@/lib/openrouter";
import { getQueryDiscoveryPrompt } from "@/lib/radar/prompts";
import { generateText } from "ai";
import { NextRequest } from "next/server";
import type { BofuProfile } from "@/types/blog-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/radar/queries/discover
 * AI-powered query discovery. Generates query suggestions based on the user's profile.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const serviceClient = createServiceRoleClient();

    // Load user profile
    const { data: profile } = await serviceClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return Response.json(
        { error: "Profile not found. Complete onboarding first." },
        { status: 404 }
      );
    }

    const typedProfile = profile as BofuProfile;

    // Generate query suggestions via LLM
    const prompt = getQueryDiscoveryPrompt(typedProfile);
    const { text } = await generateText({
      model: getRadarQueryDiscoveryModel(),
      prompt,
      temperature: 0.7,
    });

    // Parse suggestions
    let suggestions: Array<{ query_text: string; category?: string }> = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error("[Radar] Failed to parse query discovery results");
      return Response.json(
        { error: "Failed to parse AI suggestions" },
        { status: 500 }
      );
    }

    if (suggestions.length === 0) {
      return Response.json({ suggestions: [] });
    }

    // Save suggestions to radar_query_suggestions
    const rows = suggestions.map((s) => ({
      user_id: user.id,
      query_text: s.query_text,
      category: s.category || null,
      status: "suggested" as const,
    }));

    const { data: savedSuggestions, error } = await serviceClient
      .from("radar_query_suggestions")
      .insert(rows)
      .select();

    if (error) {
      console.error("[Radar] Failed to save suggestions:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ suggestions: savedSuggestions || [] });
  } catch (error: unknown) {
    console.error("Radar query discover API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
