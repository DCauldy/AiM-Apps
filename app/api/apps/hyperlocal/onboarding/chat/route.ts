import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getHyperlocalOnboardingModel } from "@/lib/openrouter";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Structured-extraction onboarding for Hyperlocal.
 *
 * Walks the user through capturing a sender profile (CAN-SPAM physical
 * address required) and a default branding profile. CRM + Email connection
 * happen via the existing Settings tabs (real OAuth + API keys can't live
 * inside a chat).
 *
 * Each turn:
 *   1. Client posts the running message thread + currently-extracted draft
 *   2. Server asks Claude to update the draft from the user's latest reply
 *      and produce the next question (or finalize)
 *   3. Returns the new draft state + assistant message
 *   4. When the user confirms, client calls /onboarding/finalize to persist.
 */

const DraftSchema = z.object({
  full_name: z.string().nullable(),
  title: z.string().nullable(),
  brokerage: z.string().nullable(),
  phone: z.string().nullable(),
  reply_to_email: z.string().nullable(),
  license_number: z.string().nullable(),
  physical_address: z
    .string()
    .nullable()
    .describe(
      "Full mailing address as a single string, ready for the email footer. Required by CAN-SPAM."
    ),
  sign_off: z.string().nullable(),
  brand_name: z.string().nullable(),
  primary_color: z
    .string()
    .nullable()
    .describe("Hex color (#RRGGBB), or null if user didn't specify."),
});

const TurnSchema = z.object({
  draft: DraftSchema,
  assistant_message: z
    .string()
    .describe(
      "What to say to the user next — one specific question OR a confirmation request."
    ),
  ready_to_save: z
    .boolean()
    .describe(
      "True only when all required fields (full_name, physical_address) are present AND the user has confirmed they're ready to save."
    ),
  missing_required: z
    .array(z.enum(["full_name", "physical_address"]))
    .describe("Required fields still missing."),
});

const SYSTEM_PROMPT = `You are guiding a real estate agent through Hyperlocal onboarding. Your job is to collect the sender profile fields needed to send CAN-SPAM-compliant emails.

REQUIRED (must collect before save):
- full_name — their name as it should appear in emails
- physical_address — full mailing address (street, city, state, zip), legally required

NICE TO HAVE (ask, accept "skip"):
- title (e.g. "Realtor, ABR")
- brokerage
- phone
- reply_to_email — where replies should land
- license_number
- sign_off — default "Talk soon,"
- brand_name and primary_color — for email branding

RULES:
1. Ask ONE thing at a time. Keep questions short, friendly, conversational.
2. Parse natural language aggressively — if the user types "I'm Jane Smith with Caldwell Realty", extract full_name="Jane Smith" and brokerage="Caldwell Realty".
3. When a user says "skip" or "next" on an optional field, leave it null and move on.
4. Don't fabricate fields. If the user hasn't said it, leave it null.
5. The physical_address must be a complete mailing address. If they just give a city, ask for the full street + city + state + zip.
6. When all required fields are filled, summarize back to them and ask "Look right? Say 'yes' to save."
7. Only set ready_to_save=true after they explicitly confirm.
8. Keep your assistant_message under 30 words.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const currentDraft = body.draft ?? {};

  // Build the conversation summary for Claude
  const conversation = messages
    .map(
      (m: { role: string; content: string }) =>
        `${m.role.toUpperCase()}: ${m.content}`
    )
    .join("\n\n");

  const prompt = `Current draft state:
${JSON.stringify(currentDraft, null, 2)}

Conversation so far:
${conversation}

Update the draft based on the user's latest message and decide what to ask next.`;

  let result;
  try {
    result = await generateObject({
      model: getHyperlocalOnboardingModel(),
      schema: TurnSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 800,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Onboarding LLM failed" },
      { status: 500 }
    );
  }

  // Persist the chat turn to the existing bofu_onboarding_chats table?
  // We don't have a hyperlocal-specific table for this — for now, history
  // lives client-side until the user finalizes. If you want long-term audit,
  // we'd add an hl_onboarding_chats table.

  return Response.json({
    draft: result.object.draft,
    assistant_message: result.object.assistant_message,
    ready_to_save: result.object.ready_to_save,
    missing_required: result.object.missing_required,
  });
}
