import { COMPLIANCE_PREAMBLE } from "@/lib/listing-studio/compliance";
import type { PropertyFacts } from "@/types/listing-studio";

// ============================================================
// Listing description (MLS Public Remarks) prompt
//
// Mirrors the Cowork `listing-remarks-writer` skill: noun-dense, feature-rich,
// MLS-Public-Remarks format, no fluff. Bakes in the shared compliance preamble
// so prevention sits inside the prompt rather than only relying on the
// post-generation Haiku validator pass.
// ============================================================

export interface DescriptionPromptInput {
  facts: PropertyFacts;
  /** Used to name the writer in the system context — never leaks into output. */
  profileName?: string;
  /** Defaults to 1000 (typical MLS Public Remarks ceiling). */
  charLimit?: number;
}

function formatFactsBlock(facts: PropertyFacts): string {
  const rows: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    rows.push(`- ${label}: ${value}`);
  };

  push("City", facts.city);
  push("State", facts.state);
  push("ZIP", facts.zip);
  push("Property type", facts.property_type);
  push("Beds", facts.beds);
  push("Baths", facts.baths);
  if (facts.living_area_sqft) {
    push("Living area (sqft)", facts.living_area_sqft.toLocaleString());
  }
  if (facts.lot_area_sqft) {
    push("Lot (sqft)", facts.lot_area_sqft.toLocaleString());
  }
  push("Year built", facts.year_built);
  push("Garage spaces", facts.garage_spaces);

  return rows.length > 0 ? rows.join("\n") : "- (no facts provided)";
}

export function getDescriptionPrompt(input: DescriptionPromptInput): string {
  const { facts, profileName, charLimit = 1000 } = input;

  return `${COMPLIANCE_PREAMBLE}

## Your task

You are writing the MLS Public Remarks (listing description) for a property
that will appear on the MLS and syndicate to Zillow, Redfin, Realtor.com,
and the listing brokerage site${profileName ? ` for ${profileName}` : ""}.

## Property facts

${formatFactsBlock(facts)}

## Format and style

- Plain prose. No bullet lists, no markdown, no headers.
- 2–4 short paragraphs. First paragraph hooks with the most distinctive
  feature of the home. Middle paragraph(s) walk through interior + exterior
  features by category (kitchen, primary suite, outdoor space, garage, lot).
  Closing sentence is factual and forward-looking — what the buyer is buying
  into spatially, not emotionally.
- Noun-dense. Lead with concrete features (granite counters, quartz island,
  vaulted ceilings, fenced backyard, three-car garage), not adjectives.
- Use active voice. Cut filler words.
- HARD character limit: ${charLimit} characters total, including spaces.
  Self-truncate to stay under. If you can't fit a feature, drop it — never
  go over.
- Do NOT include: agent name, brokerage, phone, email, URL, call-to-action,
  showing instructions, exclamation points, all-caps emphasis, the words
  "stunning", "must-see", "won't last", "dream home", "perfect for", or
  "family".

## Output

Return ONLY the listing description text. No preamble ("Here's the
description:"), no quotes around it, no markdown fences, no closing notes.
Just the prose, ready to paste into the MLS Public Remarks field.`;
}
