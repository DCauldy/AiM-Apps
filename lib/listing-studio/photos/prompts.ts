// Vision prompts for photo ordering + caption generation.
//
// Both prompts ask Claude to return strict JSON we can parse downstream.

import type { PropertyFacts } from "@/types/listing-studio";
import { COMPLIANCE_PREAMBLE } from "@/lib/listing-studio/compliance";

/**
 * Compact one-line facts header — gives the model enough context to
 * disambiguate (e.g., "second living room" vs. "primary").
 */
function factsLine(facts: PropertyFacts): string {
  const parts: string[] = [];
  if (facts.beds != null) parts.push(`${facts.beds} bd`);
  if (facts.baths != null) parts.push(`${facts.baths} ba`);
  if (facts.living_area_sqft != null)
    parts.push(`${facts.living_area_sqft.toLocaleString()} sqft`);
  if (facts.year_built != null) parts.push(`built ${facts.year_built}`);
  if (facts.property_type) parts.push(facts.property_type);
  if (facts.garage_spaces != null)
    parts.push(`${facts.garage_spaces}-car garage`);
  return parts.join(" · ") || "no facts supplied";
}

/**
 * Canonical slot vocabulary the model must choose from. Keeps caption
 * generation aligned with the order it picked.
 */
export const PHOTO_SLOTS = [
  "front_exterior",
  "foyer",
  "living_room",
  "family_room",
  "dining_room",
  "kitchen",
  "primary_bedroom",
  "primary_bath",
  "bedroom",
  "bathroom",
  "office",
  "laundry",
  "basement",
  "garage",
  "outdoor",
  "pool",
  "view",
  "detail",
  "other",
] as const;

export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/**
 * Ordering prompt. Model sees all photos (indexed 0..N-1) and returns the
 * recommended walkthrough sequence. We don't pass the original filenames —
 * we want the model to rely on what it sees, not the agent's naming.
 */
export function getPhotoOrderingPrompt(facts: PropertyFacts): string {
  return `You are arranging real estate listing photos in the order an MLS viewer would prefer.

Property: ${factsLine(facts)}

Rules:
1. Front exterior FIRST.
2. Then move through the home in the order a buyer would walk it:
   foyer/entry → main living spaces → kitchen → dining → primary bedroom → primary bath → other bedrooms → other baths → office/laundry → basement → garage.
3. Outdoor spaces (yard, deck, pool, views) LAST.
4. Detail shots (light fixtures, hardware, etc.) at the very end of their related room or grouped at the end.
5. Skip nothing — every input photo must appear exactly once.

Slot vocabulary (choose ONE per photo):
${PHOTO_SLOTS.join(", ")}

Return ONLY a JSON array — no prose, no markdown fences. Each element:
  { "index": <original 0-based index>, "slot": "<slot>" }

The array's POSITION is the new display order (position 0 = photo shown first).`;
}

/**
 * Captioning prompt. Run AFTER ordering — model sees photos in their final
 * display order and writes one MLS-ready caption per photo.
 */
export function getPhotoCaptioningPrompt(facts: PropertyFacts): string {
  return `You are writing MLS photo captions for a real estate listing.

Property: ${factsLine(facts)}

${COMPLIANCE_PREAMBLE}

Caption-specific rules:
- Stick to what is VISIBLE in the photo. No inventing features.
- 8-18 words per caption.

Style:
- Lead with the room/area, then 1-2 standout visible features.
- Match the order the photos appear (the input order = display order).
- Each caption stands alone (no "this one", "as shown above" cross-refs).

Return ONLY a JSON array — no prose, no markdown fences. Each element:
  { "order": <1-based display order>, "caption": "<text>" }`;
}
