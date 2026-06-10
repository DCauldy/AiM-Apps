// GET    /api/apps/listing-studio/listings/[id]/photos
//        List ls_photos rows for a listing (ordered by suggested_order NULLS LAST,
//        created_at as tiebreak).
//
// DELETE /api/apps/listing-studio/listings/[id]/photos?photoId=...
//        Remove a single photo (storage object + db row). If no photoId, deletes all.
//
// POST   /api/apps/listing-studio/listings/[id]/photos
//        Trigger AI processing. Body: { photoIds?: string[] }. Dispatches the
//        Inngest event in production; runs inline in development for fast iteration.
//
// PATCH  /api/apps/listing-studio/listings/[id]/photos
//        Manual edits. Body: { photoId, suggested_order?, caption? }.

import { NextRequest } from "next/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { deletePhotos } from "@/lib/listing-studio/photos/storage";
import { inngest } from "@/lib/inngest/client";
import type { ListingPhotoRow, ListingRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";
// AI vision calls can be slow; budget for inline dev runs.
export const maxDuration = 300;

async function loadOwnedListing(userId: string, listingId: string) {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("ls_listings")
    .select("id, user_id, stage")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Pick<ListingRow, "id" | "user_id" | "stage"> | null) ?? null;
}

// ---------------------------------------------------------------------------
// GET — list photos
// ---------------------------------------------------------------------------

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

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("ls_photos")
    .select("*")
    .eq("listing_id", id)
    .order("suggested_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ photos: (data ?? []) as ListingPhotoRow[] });
}

// ---------------------------------------------------------------------------
// DELETE — single photo or all photos
// ---------------------------------------------------------------------------

export async function DELETE(
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

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  const photoId = req.nextUrl.searchParams.get("photoId");
  const service = createServiceRoleClient();

  let query = service.from("ls_photos").select("id, storage_path").eq("listing_id", id);
  if (photoId) query = query.eq("id", photoId);

  const { data: rows, error: loadErr } = await query;
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  const targets = (rows ?? []) as Array<{ id: string; storage_path: string }>;
  if (targets.length === 0) return Response.json({ deleted: 0 });

  // Best-effort storage cleanup; even if it fails, drop the rows so we
  // don't leak orphan DB references.
  try {
    await deletePhotos(targets.map((r) => r.storage_path));
  } catch (err) {
    console.error("[listing-studio] storage cleanup failed:", err);
  }

  const { error: delErr } = await service
    .from("ls_photos")
    .delete()
    .in("id", targets.map((r) => r.id));
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  return Response.json({ deleted: targets.length });
}

// ---------------------------------------------------------------------------
// POST — trigger AI processing
// ---------------------------------------------------------------------------

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

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
  if (listing.stage !== "active") {
    return Response.json(
      { error: "Photos are only available on active-stage listings." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const photoIds: string[] | undefined = Array.isArray(body?.photoIds)
    ? body.photoIds.filter((v: unknown): v is string => typeof v === "string")
    : undefined;

  // Dev mode: run inline so the developer can debug without an Inngest worker.
  // Prod mode: dispatch the event and let Inngest handle retries + concurrency.
  if (process.env.NODE_ENV === "development") {
    const { processPhotos } = await import("@/lib/listing-studio/photos/pipeline");
    try {
      const result = await processPhotos(user.id, id, photoIds ?? null);
      return Response.json({ status: "completed", ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      return Response.json({ status: "failed", error: message }, { status: 500 });
    }
  }

  await inngest.send({
    name: "listing-studio/photos.process.requested",
    data: { userId: user.id, listingId: id, photoIds },
  });
  return Response.json({ status: "queued" });
}

// ---------------------------------------------------------------------------
// PATCH — manual edits (reorder, caption)
// ---------------------------------------------------------------------------

export async function PATCH(
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

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const photoId = typeof body?.photoId === "string" ? body.photoId : null;
  if (!photoId) {
    return Response.json({ error: "photoId is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.suggested_order === "number") {
    updates.suggested_order = body.suggested_order;
  }
  if (typeof body.caption === "string") {
    updates.caption = body.caption;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no editable fields supplied" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("ls_photos")
    .update(updates)
    .eq("id", photoId)
    .eq("listing_id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ photo: data as ListingPhotoRow });
}
