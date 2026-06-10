// Photo processing pipeline — orders photos via vision AI, then captions
// each one. Updates ls_photos rows in place and writes a combined
// `captions_doc` to ls_outputs.
//
// Batching: the vision model gets all photos at once if N ≤ 20; otherwise we
// split into ≤20-photo batches for ordering and stitch the results.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { getListingStudioVisionModel } from "@/lib/openrouter";
import {
  getPhotoOrderingPrompt,
  getPhotoCaptioningPrompt,
  PHOTO_SLOTS,
  type PhotoSlot,
} from "./prompts";
import { getPhotoAsBase64DataUri } from "./storage";
import type { ListingPhotoRow, PropertyFacts } from "@/types/listing-studio";

const BATCH_SIZE = 20;

interface OrderingResultItem {
  index: number;
  slot: PhotoSlot;
}

interface CaptionResultItem {
  order: number;
  caption: string;
}

/**
 * Strip markdown code fences and parse a JSON array. Vision models often
 * wrap output in ```json … ``` despite "no fences" instructions.
 */
function parseJsonArray<T>(raw: string): T[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Vision model returned no JSON array");
  return JSON.parse(match[0]) as T[];
}

function isValidSlot(s: unknown): s is PhotoSlot {
  return typeof s === "string" && (PHOTO_SLOTS as readonly string[]).includes(s);
}

/**
 * Friendly slug for the renamed zip filenames. "primary_bedroom" → "primary-bedroom"
 */
export function slotToSlug(slot: string): string {
  return slot.replace(/_/g, "-");
}

/**
 * Process one batch of photos for ordering. Returns the raw model output
 * (caller stitches batches together).
 */
async function orderBatch(
  photos: ListingPhotoRow[],
  facts: PropertyFacts,
): Promise<OrderingResultItem[]> {
  const dataUris = await Promise.all(
    photos.map((p) => getPhotoAsBase64DataUri(p.storage_path)),
  );

  const imageParts = dataUris.flatMap((uri, i) => [
    { type: "text" as const, text: `Photo index ${i}:` },
    { type: "image" as const, image: uri },
  ]);

  const { text } = await generateText({
    model: getListingStudioVisionModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: getPhotoOrderingPrompt(facts) },
          ...imageParts,
        ],
      },
    ],
    maxOutputTokens: 4000,
  });

  const parsed = parseJsonArray<OrderingResultItem>(text);

  // Validate: every input index must appear exactly once; slot must be known.
  // Drop anything malformed and backfill missing indices at the end as "other".
  const seen = new Set<number>();
  const cleaned: OrderingResultItem[] = [];
  for (const item of parsed) {
    if (
      typeof item?.index === "number" &&
      item.index >= 0 &&
      item.index < photos.length &&
      !seen.has(item.index) &&
      isValidSlot(item.slot)
    ) {
      seen.add(item.index);
      cleaned.push({ index: item.index, slot: item.slot });
    }
  }
  for (let i = 0; i < photos.length; i++) {
    if (!seen.has(i)) cleaned.push({ index: i, slot: "other" });
  }
  return cleaned;
}

/**
 * Generate captions for the photos in their final display order.
 */
async function captionPhotos(
  orderedPhotos: ListingPhotoRow[],
  facts: PropertyFacts,
): Promise<CaptionResultItem[]> {
  const dataUris = await Promise.all(
    orderedPhotos.map((p) => getPhotoAsBase64DataUri(p.storage_path)),
  );

  const { text } = await generateText({
    model: getListingStudioVisionModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: getPhotoCaptioningPrompt(facts) },
          ...dataUris.flatMap((uri, i) => [
            { type: "text" as const, text: `Photo ${i + 1}:` },
            { type: "image" as const, image: uri },
          ]),
        ],
      },
    ],
    maxOutputTokens: 4000,
  });

  const parsed = parseJsonArray<CaptionResultItem>(text);
  // Backfill: if the model returned fewer captions than photos, pad with empties.
  const byOrder = new Map<number, string>();
  for (const c of parsed) {
    if (typeof c?.order === "number" && typeof c?.caption === "string") {
      byOrder.set(c.order, c.caption.trim());
    }
  }
  return orderedPhotos.map((_, i) => ({
    order: i + 1,
    caption: byOrder.get(i + 1) ?? "",
  }));
}

/**
 * Run the full pipeline against the photos in `photoIds` (or all photos for
 * the listing if `photoIds` is null). On success, every photo has a
 * suggested_order + caption + processed_at, and a captions_doc output row
 * exists in ls_outputs.
 */
export async function processPhotos(
  userId: string,
  listingId: string,
  photoIds: string[] | null = null,
): Promise<{ processed: number }> {
  const supabase = createServiceRoleClient();

  // Verify listing ownership and grab facts.
  const { data: listing, error: listingErr } = await supabase
    .from("ls_listings")
    .select("id, user_id, property_facts, stage")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (listingErr) throw new Error(`Load listing failed: ${listingErr.message}`);
  if (!listing) throw new Error("Listing not found or not owned by user");

  const facts = (listing.property_facts ?? {}) as PropertyFacts;

  // Load photos for the listing.
  let query = supabase
    .from("ls_photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: true });
  if (photoIds && photoIds.length > 0) {
    query = query.in("id", photoIds);
  }
  const { data: photoRows, error: photoErr } = await query;
  if (photoErr) throw new Error(`Load photos failed: ${photoErr.message}`);
  const photos = (photoRows ?? []) as ListingPhotoRow[];
  if (photos.length === 0) return { processed: 0 };

  // ---- 1. Ordering (batched) -------------------------------------------
  // For >20 photos: each batch independently produces a slot-tagged order;
  // we then sort all photos by a "canonical slot rank" (front_exterior first,
  // outdoor last) and use the original within-batch position as the tiebreak.
  const batches: ListingPhotoRow[][] = [];
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    batches.push(photos.slice(i, i + BATCH_SIZE));
  }

  // Each ordered item gets a stable (batch, batchPosition) tuple.
  const slotRank: Record<string, number> = {
    front_exterior: 0,
    foyer: 10,
    living_room: 20,
    family_room: 30,
    dining_room: 40,
    kitchen: 50,
    primary_bedroom: 60,
    primary_bath: 70,
    bedroom: 80,
    bathroom: 90,
    office: 100,
    laundry: 110,
    basement: 120,
    garage: 130,
    outdoor: 140,
    pool: 145,
    view: 150,
    detail: 160,
    other: 200,
  };

  type Ranked = {
    photo: ListingPhotoRow;
    slot: PhotoSlot;
    batchIdx: number;
    posInBatch: number;
  };
  const ranked: Ranked[] = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const ordering = await orderBatch(batch, facts);
    ordering.forEach((item, pos) => {
      const photo = batch[item.index];
      if (photo) {
        ranked.push({ photo, slot: item.slot, batchIdx: b, posInBatch: pos });
      }
    });
  }

  ranked.sort((a, b) => {
    const ra = slotRank[a.slot] ?? 200;
    const rb = slotRank[b.slot] ?? 200;
    if (ra !== rb) return ra - rb;
    if (a.batchIdx !== b.batchIdx) return a.batchIdx - b.batchIdx;
    return a.posInBatch - b.posInBatch;
  });

  // ---- 2. Persist suggested_order ---------------------------------------
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const { error: updErr } = await supabase
      .from("ls_photos")
      .update({ suggested_order: i + 1, processed_at: new Date().toISOString() })
      .eq("id", r.photo.id);
    if (updErr) throw new Error(`Update order failed: ${updErr.message}`);
  }

  // ---- 3. Captions (one call against final ordered list, up to BATCH_SIZE
  //         photos; larger sets split). ---------------------------------
  const orderedPhotos = ranked.map((r) => r.photo);
  const allCaptions: CaptionResultItem[] = [];
  for (let i = 0; i < orderedPhotos.length; i += BATCH_SIZE) {
    const slice = orderedPhotos.slice(i, i + BATCH_SIZE);
    const sliceCaps = await captionPhotos(slice, facts);
    sliceCaps.forEach((c, j) => {
      allCaptions.push({ order: i + j + 1, caption: c.caption });
    });
  }

  for (let i = 0; i < orderedPhotos.length; i++) {
    const cap = allCaptions[i]?.caption ?? "";
    const { error: capErr } = await supabase
      .from("ls_photos")
      .update({ caption: cap })
      .eq("id", orderedPhotos[i].id);
    if (capErr) throw new Error(`Update caption failed: ${capErr.message}`);
  }

  // ---- 4. captions_doc output row (combined markdown) ------------------
  const slotByPhoto = new Map(ranked.map((r) => [r.photo.id, r.slot]));
  const captionsMd = orderedPhotos
    .map((p, i) => {
      const slot = slotByPhoto.get(p.id) ?? "other";
      const cap = allCaptions[i]?.caption ?? "";
      return `${String(i + 1).padStart(2, "0")}. **${slotToSlug(slot)}** — ${cap}`;
    })
    .join("\n");

  // Upsert pattern mirroring Slice 4's description output.
  const { data: existing } = await supabase
    .from("ls_outputs")
    .select("id")
    .eq("listing_id", listingId)
    .eq("type", "captions_doc")
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("ls_outputs")
      .update({
        content: captionsMd,
        status: "draft",
        pipeline_error: null,
        generated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("ls_outputs").insert({
      listing_id: listingId,
      type: "captions_doc",
      variant: null,
      content: captionsMd,
      status: "draft",
    });
  }

  return { processed: orderedPhotos.length };
}

/**
 * Public helper: given a display order + its (optional) slot label parsed
 * from the captions_doc, build the renamed zip filename.
 * Falls back to plain "01.jpg" if no slot is known.
 */
export function zipFilenameFor(
  order: number,
  slot: string | null,
  storagePath: string,
): string {
  const ext = (storagePath.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "jpg").toLowerCase();
  const orderStr = String(order).padStart(2, "0");
  if (!slot) return `${orderStr}.${ext}`;
  return `${orderStr}-${slotToSlug(slot)}.${ext}`;
}

/**
 * Parse "01. **front-exterior** — caption text" lines from the captions_doc
 * markdown back into a slot lookup by display order. Best-effort — returns
 * a partial map; missing entries fall back to plain numeric filenames.
 */
export function parseSlotsFromCaptionsDoc(md: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = md.split("\n");
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+\*\*([a-z0-9-]+)\*\*\s+—/);
    if (m) {
      map.set(parseInt(m[1], 10), m[2]);
    }
  }
  return map;
}
