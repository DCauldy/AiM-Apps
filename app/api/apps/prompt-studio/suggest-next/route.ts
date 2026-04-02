import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { model } from "@/lib/openai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUGGEST_NEXT_SYSTEM_PROMPT = `You are a prompt engineering expert. Given a refined prompt and its original intent, generate 2 creative follow-up prompt suggestions.

1. "tryNext": The logical next step in the user's workflow — what would they naturally want to build or do after using this prompt? Think about the downstream task this prompt's output enables.

2. "wildCard": A surprising, high-value angle — same topic but completely different approach, medium, format, or prompt type. Push the user to think bigger or differently.

Return a JSON object with this exact shape:
{
  "tryNext": {
    "title": "Short action title (4-7 words)",
    "description": "One sentence explaining what this prompt will do for them.",
    "suggestion": "A 1-2 sentence lazy prompt the user can start with, written as if they're describing their goal."
  },
  "wildCard": {
    "title": "Short action title (4-7 words)",
    "description": "One sentence explaining what this surprising angle unlocks.",
    "suggestion": "A 1-2 sentence lazy prompt the user can start with, written as if they're describing their goal."
  }
}

Rules:
- Titles must be specific and action-oriented, not generic (e.g. "Build a Lead Follow-Up Sequence" not "Next Steps")
- Descriptions must be concrete about the value, not vague
- Suggestions must feel like natural things a real user would type
- Wild Card should genuinely surprise — a different medium, format, or audience angle
- Return ONLY the JSON object, no markdown, no explanation`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { refinedPrompt, lazyPrompt, promptType = "standard" } = await req.json();

    if (!refinedPrompt || !lazyPrompt) {
      return new Response(JSON.stringify({ error: "refinedPrompt and lazyPrompt are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: SUGGEST_NEXT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original intent: ${lazyPrompt.trim()}\n\nPrompt type: ${promptType}\n\nRefined prompt:\n${refinedPrompt.trim()}`,
        },
      ],
    });

    let suggestions;
    try {
      const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse suggestions JSON:", text);
      return new Response(
        JSON.stringify({ error: "Failed to parse suggestions" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(suggestions), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("suggest-next error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
