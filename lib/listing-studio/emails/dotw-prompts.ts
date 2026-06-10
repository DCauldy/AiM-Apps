import { COMPLIANCE_PREAMBLE } from "@/lib/listing-studio/compliance";
import type { PropertyFacts } from "@/types/listing-studio";
import type { ListingStudioAgentProfile } from "@/lib/profiles/effective-profile";

// ============================================================
// DOTW (Deal of the Week) email prompts.
//
// Output: plain text — no HTML. This is the "personal note to your sphere"
// email, not a marketing blast. Subject + preheader + body, that's it.
//
// We generate two variants in parallel so the agent can pick the tone that
// fits the week. Variant A is question-led (curiosity hook); Variant B is
// numbered-reasons (skimmable specifics). Different opening, same compliance
// floor, same factual grounding in the property facts.
// ============================================================

export type DotwVariant = "a" | "b";

export interface DotwPromptInput {
  facts: PropertyFacts;
  listingAddress: string;
  agentProfile: ListingStudioAgentProfile;
  variant: DotwVariant;
  /** Optional freeform notes the agent dropped on the listing — short cues
   *  like "open house Saturday" or "owner relocating, motivated". */
  agentNotes?: string | null;
}

/**
 * The DOTW writer prompt. Returns a single string we pass as `prompt` to
 * generateText. The model is instructed to return strict JSON so the route
 * can split out subject / preheader / body without regex gymnastics.
 */
export function getDotwPrompt(input: DotwPromptInput): string {
  const { facts, listingAddress, agentProfile, variant, agentNotes } = input;

  const variantBlock =
    variant === "a"
      ? `**Variant: question-led.**
Open with a single conversational question that reads like the agent is
texting a friend who lives in the area. The question should reference the
specific street, neighborhood, or a visible feature of the home — NOT a
generic "have you seen anything new lately?" Then deliver 2–3 short
paragraphs that justify why this listing earned the spotlight, woven
naturally — no bullet lists, no headers. Close with a soft invitation
(coffee, walk-through, share it with someone they know).`
      : `**Variant: numbered reasons.**
Open with a one-sentence framing line that names the listing and what
makes it stand out at a high level. Follow with a short numbered list
(exactly three items, no more) — each item is a single sentence calling
out one concrete feature or location detail backed by the facts below.
After the list, one closing paragraph that invites the reader to act
(stop by, forward to a friend, reply with questions). No bullet lists,
no headers other than the numbered items.`;

  const factsBlock = formatFactsBlock(facts, listingAddress);
  const agentBlock = formatAgentBlock(agentProfile);
  const notesBlock = agentNotes && agentNotes.trim()
    ? `\n\nAgent notes on this listing (use only what is factually relevant; do not quote verbatim):\n"""\n${agentNotes.trim()}\n"""`
    : "";

  return `${COMPLIANCE_PREAMBLE}

You are writing a "Deal of the Week" email for a real estate agent to send to
their personal sphere-of-influence list. This is NOT a marketing blast — it
should read like a personal note from the agent.

Hard constraints:
- Plain text ONLY. No HTML, no markdown headings, no bold/italic markers.
- Sound like the agent talking to one friend. Casual, warm, not promotional.
- Subject line under 60 characters, no all-caps, no emojis.
- Preheader under 100 characters, complements the subject (doesn't repeat it).
- Body 90–160 words. Not longer.
- The body must be self-contained — do NOT include "Best, [Agent]" — the
  agent's signature is appended automatically. End on the closing thought.
- Never reference a price or list price unless the user has explicitly
  included one in the facts. Pricing belongs in the HTML email, not DOTW.

${variantBlock}

${factsBlock}

${agentBlock}${notesBlock}

Return a single JSON object with this exact shape, no markdown fences, no
prose outside the JSON:

{
  "subject": "string",
  "preheader": "string",
  "body": "string"
}`;
}

function formatFactsBlock(facts: PropertyFacts, address: string): string {
  const lines: string[] = [];
  lines.push(`Address: ${address}`);
  if (facts.city || facts.state || facts.zip) {
    lines.push(
      `Location: ${[facts.city, facts.state, facts.zip].filter(Boolean).join(", ")}`,
    );
  }
  if (facts.property_type) lines.push(`Type: ${facts.property_type}`);
  if (facts.beds != null) lines.push(`Beds: ${facts.beds}`);
  if (facts.baths != null) lines.push(`Baths: ${facts.baths}`);
  if (facts.living_area_sqft != null)
    lines.push(`Living area: ${facts.living_area_sqft.toLocaleString()} sqft`);
  if (facts.lot_area_sqft != null)
    lines.push(`Lot: ${facts.lot_area_sqft.toLocaleString()} sqft`);
  if (facts.year_built != null) lines.push(`Year built: ${facts.year_built}`);
  if (facts.garage_spaces != null)
    lines.push(`Garage: ${facts.garage_spaces} spaces`);
  return `Property facts (use only these — do not invent additional details):\n${lines.join("\n")}`;
}

function formatAgentBlock(p: ListingStudioAgentProfile): string {
  const parts: string[] = [];
  if (p.full_name) parts.push(`Name: ${p.full_name}`);
  if (p.brokerage) parts.push(`Brokerage: ${p.brokerage}`);
  if (p.metro_area) parts.push(`Market: ${p.metro_area}`);
  if (p.state) parts.push(`State: ${p.state}`);
  if (parts.length === 0) return "";
  return `Agent context (for voice, not to quote):\n${parts.join("\n")}`;
}
