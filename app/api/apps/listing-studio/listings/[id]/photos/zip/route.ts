// GET /api/apps/listing-studio/listings/[id]/photos/zip
//
// Streams a zip with photos renamed by suggested_order + a captions.md
// companion file. Storage objects themselves remain — the cron job will
// reap them at expires_at.

import { NextRequest } from "next/server";
import JSZip from "jszip";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getPhotoBuffer } from "@/lib/listing-studio/photos/storage";
import {
  parseSlotsFromCaptionsDoc,
  zipFilenameFor,
} from "@/lib/listing-studio/photos/pipeline";
import type {
  ListingOutputRow,
  ListingPhotoRow,
  ListingRow,
} from "@/types/listing-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function safeAddressSlug(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "listing";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
  const typedListing = listing as ListingRow;

  // Photos ordered by AI suggestion (manual edits respected).
  const { data: photoRows } = await service
    .from("ls_photos")
    .select("*")
    .eq("listing_id", id)
    .order("suggested_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const photos = (photoRows ?? []) as ListingPhotoRow[];

  if (photos.length === 0) {
    return Response.json({ error: "No photos to download" }, { status: 400 });
  }

  // Pull captions_doc (if any) to recover slot labels for filenames.
  const { data: captionsRow } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", id)
    .eq("type", "captions_doc")
    .maybeSingle();
  const captionsDoc = (captionsRow as ListingOutputRow | null)?.content ?? null;
  const slotsByOrder = captionsDoc
    ? parseSlotsFromCaptionsDoc(captionsDoc)
    : new Map<number, string>();

  const zip = new JSZip();

  // Add captions.md first so it sits at the top of the archive.
  const captionsMd = buildCaptionsMd(typedListing, photos, slotsByOrder);
  zip.file("captions.md", captionsMd);

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const order = p.suggested_order ?? i + 1;
    const slot = slotsByOrder.get(order) ?? null;
    const filename = zipFilenameFor(order, slot, p.storage_path);
    try {
      const buf = await getPhotoBuffer(p.storage_path);
      zip.file(filename, buf);
    } catch (err) {
      // Skip missing photos rather than failing the whole archive.
      console.error(`[listing-studio] zip: skipped ${p.id}:`, err);
    }
  }

  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${safeAddressSlug(typedListing.address)}-photos.zip`;

  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function buildCaptionsMd(
  listing: ListingRow,
  photos: ListingPhotoRow[],
  slotsByOrder: Map<number, string>,
): string {
  const lines: string[] = [];
  lines.push(`# Photo captions — ${listing.address}`);
  lines.push("");
  lines.push("_Paste into your MLS one row per photo. Order matches the renamed files in this archive._");
  lines.push("");
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const order = p.suggested_order ?? i + 1;
    const slot = slotsByOrder.get(order);
    const caption = p.caption?.trim() || "_(no caption — add one in Listing Studio before re-downloading)_";
    const label = slot ? ` (${slot})` : "";
    lines.push(`${String(order).padStart(2, "0")}.${label} ${caption}`);
  }
  return lines.join("\n");
}
