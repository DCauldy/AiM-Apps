// Listing Studio photo storage helpers.
//
// Photos live in the `listing-studio-photos` bucket, keyed by
//   ${userId}/${listingId}/${photoId}.${ext}
//
// All photos are temporary (1hr TTL) — this module never persists long-term.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const BUCKET = "listing-studio-photos";

/**
 * Idempotently create the storage bucket. Safe to call from every code path —
 * if the bucket already exists, the duplicate-error is swallowed.
 */
export async function ensureBucket(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Failed to create bucket ${BUCKET}: ${error.message}`);
  }
}

function extOf(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] ?? "jpg").toLowerCase();
}

export interface UploadResult {
  photoId: string;
  storagePath: string;
}

/**
 * Upload one File to storage. Returns the assigned photoId (UUID) and the
 * storage key. Caller is responsible for the matching ls_photos row insert.
 */
export async function uploadPhoto(
  file: File,
  userId: string,
  listingId: string,
): Promise<UploadResult> {
  await ensureBucket();
  const supabase = createServiceRoleClient();
  const photoId = randomUUID();
  const ext = extOf(file.name);
  const storagePath = `${userId}/${listingId}/${photoId}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  return { photoId, storagePath };
}

/**
 * Issue a signed URL the vision model can fetch directly (server-side).
 * Default 1hr matches the row's expires_at.
 */
export async function signedUrl(
  storagePath: string,
  expiresInSec = 3600,
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL failed for ${storagePath}: ${error?.message}`);
  }
  return data.signedUrl;
}

/**
 * Remove storage objects in bulk. The ls_photos row deletion is the caller's
 * responsibility (DB cascade or explicit DELETE).
 */
export async function deletePhotos(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).remove(storagePaths);
  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

/**
 * Download a single object and return a base64 data URI. The vision model
 * accepts either URLs or inline base64 — base64 is safest because it avoids
 * any provider-side fetch flakiness against time-limited signed URLs.
 */
export async function getPhotoAsBase64DataUri(
  storagePath: string,
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message}`);
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = extOf(storagePath);
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic"
          ? "image/heic"
          : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Stream a storage object as a raw Buffer — used by the zip route.
 */
export async function getPhotoBuffer(storagePath: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
