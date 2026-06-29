import type { SphereSnapshot } from "@/lib/hyperlocal/sphere";
import type { DialLens, DialDepth } from "@/components/hyperlocal/sphere/CampaignDialPanel";

// ============================================================
// Sphere suggestion — the "we already built you a campaign" magic.
// Given a profile's sphere snapshot, propose a complete, ready-to-send
// campaign: which neighborhoods to light up, the angle, and the depth.
// Pure heuristics over the snapshot (no AI call) so it's instant on
// arrival; the user tweaks the dials or just hits Send.
// ============================================================

export interface CampaignSuggestion {
  zips: string[];
  lens: DialLens;
  depth: DialDepth;
  reach: number;
  /** Human one-liner explaining the pick, shown above the dial panel. */
  rationale: string;
}

/** How many top neighborhoods we pre-light. Enough to feel substantial,
 *  few enough to stay focused (and respect lower pack tiers downstream). */
const DEFAULT_PICK = 6;
/** A neighborhood needs at least this many contacts to be worth a send. */
const MIN_CONTACTS = 3;
/** Seller/buyer skew beyond this ratio tips the angle off "balanced". */
const SKEW_RATIO = 1.5;

export function suggestCampaign(
  snapshot: SphereSnapshot | null,
  pick = DEFAULT_PICK,
): CampaignSuggestion | null {
  if (!snapshot || snapshot.zips.length === 0) return null;

  // Opportunity = contact density. Take the densest neighborhoods that clear
  // the floor (snapshot.zips is already sorted desc by contact_count).
  const worthy = snapshot.zips.filter((z) => z.contact_count >= MIN_CONTACTS);
  const chosen = (worthy.length > 0 ? worthy : snapshot.zips).slice(0, pick);
  if (chosen.length === 0) return null;

  const sellers = chosen.reduce((s, z) => s + z.seller_count, 0);
  const buyers = chosen.reduce((s, z) => s + z.buyer_count, 0);

  let lens: DialLens = "balanced";
  if (sellers > buyers * SKEW_RATIO) lens = "seller";
  else if (buyers > sellers * SKEW_RATIO) lens = "buyer";

  const contacts = chosen.reduce((s, z) => s + z.contact_count, 0);

  return {
    zips: chosen.map((z) => z.zip),
    lens,
    depth: "full",
    reach: 3,
    rationale: rationale(chosen.length, contacts, lens),
  };
}

function rationale(zipCount: number, contacts: number, lens: DialLens): string {
  const where = `your ${zipCount} busiest neighborhood${zipCount === 1 ? "" : "s"}`;
  const who =
    lens === "seller"
      ? "leaning seller — that's where your sphere lives"
      : lens === "buyer"
        ? "leaning buyer — that's who's searching"
        : "a balanced market note";
  return `We lit up ${where} (${contacts.toLocaleString()} contacts) with ${who}.`;
}
