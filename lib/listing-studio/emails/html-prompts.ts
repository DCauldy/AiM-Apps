import { COMPLIANCE_PREAMBLE } from "@/lib/listing-studio/compliance";
import type { PropertyFacts } from "@/types/listing-studio";
import type { ListingStudioAgentProfile } from "@/lib/profiles/effective-profile";
import type { HtmlEmailVariant, CmaSummary } from "./html-render";

// ============================================================
// Just-Listed HTML email — COPY prompt only.
//
// Claude generates the copy blocks (subject, headline, body, CTA label).
// The template (lib/listing-studio/emails/html-render.ts) slots those into
// inline-styled HTML. We never ask Claude to emit raw HTML — malformed
// markup in email clients is debugging hell, and inline-styled email
// templates are too unforgiving for "trust the LLM" output.
// ============================================================

export interface HtmlEmailCopyPromptInput {
  facts: PropertyFacts;
  listingAddress: string;
  agentProfile: ListingStudioAgentProfile;
  variant: HtmlEmailVariant;
  agentNotes?: string | null;
  /** Required for variant='pricing'. */
  cmaSummary?: CmaSummary;
}

export function getHtmlEmailCopyPrompt(input: HtmlEmailCopyPromptInput): string {
  const { facts, listingAddress, agentProfile, variant, cmaSummary, agentNotes } =
    input;

  const variantGuidance =
    variant === "announcement"
      ? `**Variant: Announcement.**
Clean Just-Listed reveal. Headline names the neighborhood or the most
distinctive feature. Body is 2–4 sentences that paint the property in
specifics from the facts list — focus on what makes the home distinctive
to look at and live in. End with an inviting line that suggests the
reader can learn more.`
      : `**Variant: With Pricing Context.**
Same clean Just-Listed reveal, but the body should set up the "Why this
price" block that follows in the email. Headline can be slightly more
focused on value or positioning (e.g. "Priced for the {neighborhood}
market"). Body is 2–4 sentences. Do NOT restate the price in the body —
the renderer drops the price + comp positioning + market trend below the
body in its own visual block. Set up the rationale; don't deliver it.

CMA context to inform tone (do NOT copy these phrases verbatim):
- Comp positioning: ${cmaSummary?.compPositioning ?? "(none)"}
- Market trend: ${cmaSummary?.marketTrendLine ?? "(none)"}`;

  const factsBlock = formatFactsBlock(facts, listingAddress);
  const agentBlock = formatAgentBlock(agentProfile);
  const notesBlock = agentNotes && agentNotes.trim()
    ? `\n\nAgent notes on this listing:\n"""\n${agentNotes.trim()}\n"""`
    : "";

  return `${COMPLIANCE_PREAMBLE}

You are writing the COPY blocks for a "Just Listed" branded HTML email. You
are NOT writing HTML — only the text that fills the slots in a templated
email. The template will handle layout, colors, fonts, photos, signature,
and compliance footer.

Hard constraints:
- Subject under 60 characters, no all-caps, no emojis.
- Headline 4–8 words, sentence case, no trailing period, no exclamation.
- Body 2–4 sentences, total 50–110 words. Concrete and specific to the facts.
- CTA label 2–5 words, action-oriented. Examples: "View listing details",
  "See the full gallery", "Schedule a private tour".
- Do NOT include price unless this is the pricing variant — and even then,
  do NOT mention the price in the body (the template emits it separately).
- Do NOT include phone, email, or URLs — those live in the template.
- Do NOT name the agent or brokerage in the body — those live in the template.

${variantGuidance}

${factsBlock}

${agentBlock}${notesBlock}

Return a single JSON object with this exact shape, no markdown fences, no
prose outside the JSON:

{
  "subject": "string",
  "headline": "string",
  "body": "string",
  "cta_label": "string"
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
  if (p.full_name) parts.push(`Agent name: ${p.full_name} (do not include in copy)`);
  if (p.brokerage) parts.push(`Brokerage: ${p.brokerage} (do not include in copy)`);
  if (p.metro_area) parts.push(`Market: ${p.metro_area}`);
  if (parts.length === 0) return "";
  return `Agent context (for voice, not to quote):\n${parts.join("\n")}`;
}
