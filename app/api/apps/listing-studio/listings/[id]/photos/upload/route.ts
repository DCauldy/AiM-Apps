// POST /api/apps/listing-studio/listings/[id]/photos/upload
//
// Multipart form-data upload. Accepts up to MAX_FILES image files at a time.
// For each: writes to Supabase Storage, inserts ls_photos row.
// Does NOT trigger processing — that's a separate explicit action on the
// /photos route.

import { NextRequest } from "next/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { uploadPhoto } from "@/lib/listing-studio/photos/storage";
import type { ListingPhotoRow, ListingRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES = 50;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per photo
const ACCEPTED_PREFIX = "image/";

export async function POST(
  req: NextRequest,
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

  // Ownership + stage check.
  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("id, user_id, stage")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
  const typedListing = listing as Pick<ListingRow, "id" | "user_id" | "stage">;
  if (typedListing.stage !== "active") {
    return Response.json(
      { error: "Photos are only available on active-stage listings." },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const files = formData
    .getAll("photos")
    .filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return Response.json(
      { error: "No files supplied (use field name 'photos')" },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return Response.json(
      { error: `Too many files (max ${MAX_FILES} per upload)` },
      { status: 400 },
    );
  }

  const created: ListingPhotoRow[] = [];
  const failures: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    if (!file.type.startsWith(ACCEPTED_PREFIX)) {
      failures.push({ filename: file.name, error: "Not an image" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      failures.push({ filename: file.name, error: "Too large (max 25MB)" });
      continue;
    }
    try {
      const { storagePath } = await uploadPhoto(file, user.id, id);
      const { data: row, error: insErr } = await service
        .from("ls_photos")
        .insert({
          listing_id: id,
          original_filename: file.name,
          storage_path: storagePath,
        })
        .select()
        .single();
      if (insErr || !row) {
        failures.push({ filename: file.name, error: insErr?.message ?? "Insert failed" });
        continue;
      }
      created.push(row as ListingPhotoRow);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      failures.push({ filename: file.name, error: msg });
    }
  }

  return Response.json({ photos: created, failures });
}
