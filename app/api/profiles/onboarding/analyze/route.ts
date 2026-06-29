import { tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import { refineDraft, type MagicProfileDraft } from "@/lib/profiles/website-analysis";
import type { analyzeProfileTask } from "@/triggers/profile-analyze";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/profiles/onboarding/analyze
 *
 * Two actions, by body shape:
 *   { url }                  → kicks off the background analysis task and
 *                              returns { runId }; the client streams real
 *                              progress from /analyze/stream?runId=…
 *   { current, instruction } → applies a free-text correction to a draft
 *                              (fast, single model call — stays synchronous)
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
    if (body.current && typeof body.instruction === "string") {
      const draft = await refineDraft(body.current, body.instruction);
      return Response.json({ draft });
    }

    if (typeof body.url === "string") {
      const handle = await tasks.trigger<typeof analyzeProfileTask>(
        "profile-analyze",
        { url: body.url, userId: user.id },
      );
      return Response.json({ runId: handle.id });
    }

    return Response.json(
      { error: "Provide either { url } or { current, instruction }." },
      { status: 400 },
    );
  } catch (err) {
    console.error("Profile magic analyze error:", err);
    return Response.json(
      { error: "Couldn't start the analysis. Try again in a moment." },
      { status: 500 },
    );
  }
}
