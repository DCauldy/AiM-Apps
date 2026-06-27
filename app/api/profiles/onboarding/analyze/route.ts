import { createClient } from "@/lib/supabase/server";
import {
  analyzeWebsite,
  refineDraft,
  WebsiteAnalysisError,
  type MagicProfileDraft,
} from "@/lib/profiles/website-analysis";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Deep crawl + a strong model can take a while; give it room.
export const maxDuration = 120;

/**
 * POST /api/profiles/onboarding/analyze
 *
 * Two actions, distinguished by body shape:
 *   { url }                     → deep website analysis → profile draft
 *   { current, instruction }    → apply a free-text correction to a draft
 *
 * AI Magic onboarding: the user gives us their website and we hand back a
 * fully pre-filled, verifiable profile draft (incl. brand visuals).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string; current?: MagicProfileDraft; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    // Refine an existing draft from a correction.
    if (body.current && typeof body.instruction === "string") {
      const draft = await refineDraft(body.current, body.instruction);
      return Response.json({ draft });
    }

    // Fresh analysis from a URL.
    if (typeof body.url === "string") {
      const result = await analyzeWebsite(body.url);
      return Response.json(result);
    }

    return Response.json(
      { error: "Provide either { url } or { current, instruction }." },
      { status: 400 },
    );
  } catch (err) {
    // WebsiteAnalysisError carries user-friendly copy; anything else is a 500.
    if (err instanceof WebsiteAnalysisError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error("Profile magic analyze error:", err);
    return Response.json(
      { error: "Something went sideways analyzing your site. Try again in a moment." },
      { status: 500 },
    );
  }
}
