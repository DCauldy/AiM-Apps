import { createClient } from "@/lib/supabase/server";
import { QUESTION_GENERATION_SYSTEM_PROMPT } from "@/lib/prompts";
import { generateText } from "ai";
import { model } from "@/lib/openai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TYPES = ["standard", "reasoning", "deep-research", "custom-gpt", "video", "voice", "image"] as const;
type ValidType = typeof VALID_TYPES[number];

async function generateTitle(lazyPrompt: string): Promise<string> {
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content: `Generate a short, descriptive title (3-7 words, no quotes, no period at end) for a prompt project based on the user's idea. Make it specific and action-oriented. Examples: "Real Estate Listing Copywriter", "Python Code Reviewer Agent", "Weekly Workout Plan Creator".`,
      },
      { role: "user", content: lazyPrompt.trim() },
    ],
  });
  return text.trim().replace(/^["']|["']$/g, "");
}

async function detectPromptType(lazyPrompt: string): Promise<ValidType> {
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content: `Classify the user's prompt idea into exactly one of these types: standard, reasoning, deep-research, custom-gpt, video, voice, image.

- standard: general AI prompt, writing, marketing, business, code, etc.
- reasoning: logic puzzles, analysis, step-by-step thinking, math, comparisons
- deep-research: research, fact-checking, multi-source synthesis, reports
- custom-gpt: building an AI agent, assistant, GPT, chatbot, system prompt
- video: video generation (Veo, Runway, Kling, Pika, etc.)
- voice: voice/audio/TTS (Eleven Labs, etc.)
- image: image generation (Midjourney, DALL-E, Stable Diffusion, etc.)

Return ONLY the type string, nothing else.`,
      },
      { role: "user", content: lazyPrompt.trim() },
    ],
  });

  const detected = text.trim().toLowerCase() as ValidType;
  return VALID_TYPES.includes(detected) ? detected : "standard";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { lazyPrompt, promptType = "auto" } = await req.json();

    if (!lazyPrompt || typeof lazyPrompt !== "string" || !lazyPrompt.trim()) {
      return new Response(JSON.stringify({ error: "lazyPrompt is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Auto-detect type and generate title in parallel
    const [resolvedType, suggestedTitle] = await Promise.all([
      promptType === "auto" ? detectPromptType(lazyPrompt) : Promise.resolve(promptType as string),
      generateTitle(lazyPrompt),
    ]);

    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: QUESTION_GENERATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Prompt type: ${resolvedType}\n\nGenerate improvement questions for this prompt:\n\n${lazyPrompt.trim()}`,
        },
      ],
    });

    // Parse the JSON from the AI response
    let questions;
    try {
      const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      questions = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse questions JSON:", text);
      return new Response(
        JSON.stringify({ error: "Failed to parse questions", raw: text }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ questions, resolvedType, suggestedTitle }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("generate-questions error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
