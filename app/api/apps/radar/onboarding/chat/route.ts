import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOnboardingModel } from "@/lib/openrouter";
import { streamText } from "ai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * System prompt for Radar onboarding chat.
 * Collects: professional type, market, business focus, website, brand identity.
 */
function getRadarOnboardingPrompt(): string {
  return `You are a friendly onboarding assistant for AiM Radar, an AI visibility monitoring tool for real estate professionals. Your job is to collect key information through a natural conversation.

## Information to Collect

You need to gather the following (in a natural conversational flow, not as a form):

1. **Professional Type** — Are they a real estate agent, lender, team leader, brokerage, etc.?
2. **Market/Location** — What metro area, state, and specific neighborhoods or counties do they serve?
3. **Business Focus** — What client types (first-time buyers, luxury, investors, etc.) and property types do they focus on?
4. **Website URL** — Their primary business website
5. **Brand Identity** — Their business name, personal name (if different), and any name variations people might search for (e.g., "Smith Realty", "John Smith Real Estate", "Smith & Associates")
6. **Competitors** — Any known competitors they want to track (optional)

## Conversation Guidelines

- Be warm, professional, and concise
- Ask 1-2 questions at a time, not all at once
- Acknowledge their answers before moving on
- If they give partial information, ask follow-ups naturally
- When you have enough info for a section, confirm it with a card

## Card Format

When you've collected enough data for a section, output a confirmation card in this format:

:::card
{
  "section": "identity" | "market" | "business" | "website" | "brand" | "competitors",
  "fields": {
    "key": "value"
  }
}
:::

Example:
:::card
{
  "section": "market",
  "fields": {
    "metro_area": "Austin",
    "state": "TX",
    "counties": ["Travis", "Williamson"],
    "neighborhoods": ["Downtown Austin", "Round Rock", "Cedar Park"]
  }
}
:::

## Completion

When all sections are gathered, output a final summary card:

:::card
{
  "section": "complete",
  "fields": {
    "professional_type": "...",
    "full_name": "...",
    "business_name": "...",
    "metro_area": "...",
    "state": "...",
    "counties": [],
    "neighborhoods": [],
    "target_clients": [],
    "property_types": [],
    "specializations": [],
    "website_url": "...",
    "brand_variations": [],
    "competitors": []
  }
}
:::

Start by introducing yourself and asking about their role and market.`;
}

/**
 * POST /api/apps/radar/onboarding/chat
 * Streaming onboarding chat for Radar setup (Path B — conversational).
 */
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

    // Check if onboarding is already completed
    const serviceClient = createServiceRoleClient();
    const { data: config } = await serviceClient
      .from("radar_config")
      .select("id, onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (config?.onboarding_completed) {
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

    // Build conversation history
    const systemPrompt = getRadarOnboardingPrompt();
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
        }
      )
      .filter((m) => m.content);

    const result = streamText({
      model: getOnboardingModel(),
      system: systemPrompt,
      messages: modelMessages,
      onFinish: async ({ text }) => {
        if (text) {
          // Extract card data
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
    console.error("Radar onboarding chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
