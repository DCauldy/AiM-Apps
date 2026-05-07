import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOnboardingModel } from "@/lib/openrouter";
import { getOnboardingPrompt } from "@/lib/blog-engine/prompts";
import { streamText } from "ai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    // Get existing profile to check onboarding status
    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from("user_profiles")
      .select("id, onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.onboarding_completed) {
      return Response.json(
        { error: "Onboarding already completed" },
        { status: 400 }
      );
    }

    // Save user message to onboarding chat history
    const lastUserMessage = messages[messages.length - 1];
    const userContent =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content
        : lastUserMessage?.parts?.find((p: { type: string }) => p.type === "text")?.text || "";

    if (userContent && lastUserMessage?.role === "user") {
      await serviceClient.from("bofu_onboarding_chats").insert({
        user_id: user.id,
        role: "user",
        content: userContent,
      });
    }

    // Build conversation history for the model
    const systemPrompt = getOnboardingPrompt();
    const modelMessages = messages.map(
      (m: { role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => {
        // TextStreamChatTransport may send parts instead of content
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
      }
    ).filter((m) => m.content);

    const result = streamText({
      model: getOnboardingModel(),
      system: systemPrompt,
      messages: modelMessages,
      onFinish: async ({ text }) => {
        // Save assistant response to chat history
        if (text) {
          // Extract any card data from the response
          const cardMatch = text.match(/:::card\n([\s\S]*?)\n:::/);
          let extractedData = null;
          let section = null;

          if (cardMatch) {
            try {
              const cardJson = JSON.parse(cardMatch[1]);
              section = cardJson.section;
              extractedData = cardJson.fields;
            } catch {
              // Card parsing failed — non-critical
            }
          }

          await serviceClient.from("bofu_onboarding_chats").insert({
            user_id: user.id,
            role: "assistant",
            content: text,
            extracted_data: extractedData,
            section,
          });
        }
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Onboarding chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
