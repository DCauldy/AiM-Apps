import { createClient } from "@/lib/supabase/server";
import { getHyperlocalOnboardingModel } from "@/lib/openrouter";
import { getProfileOnboardingPrompt } from "@/lib/profiles/onboarding-prompt";
import { streamText } from "ai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/profiles/onboarding/chat
 *
 * Streaming conversational intake. The model collects 6 essential
 * fields and emits a :::profile JSON block when complete — the
 * client parses that block and posts it to /api/profiles to create
 * the platform_profiles row.
 *
 * Uses the existing hyperlocal onboarding model (gpt-4o-mini)
 * because its structured-output extraction is cheap, fast, and
 * doesn't suffer the OpenRouter→Anthropic tool-call translation
 * flakiness Claude has there. Plain text streaming, no tool calls.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    // TextStreamChatTransport sends `parts` instead of `content`; normalize.
    const modelMessages = messages
      .map(
        (m: {
          role: string;
          content?: string;
          parts?: Array<{ type: string; text?: string }>;
        }) => {
          const content =
            typeof m.content === "string" && m.content
              ? m.content
              : m.parts
                  ?.filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "";
          return {
            role: m.role as "user" | "assistant",
            content,
          };
        },
      )
      .filter((m) => m.content);

    const result = streamText({
      model: getHyperlocalOnboardingModel(),
      system: getProfileOnboardingPrompt(),
      messages: modelMessages,
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Profile onboarding chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
