import "server-only";

import { nanoid } from "nanoid";

export const LISTING_MEDIA_BUCKET = "tours-listing-media";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function safeListingMediaFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "listing-photo";
}

export function getListingMediaStoragePath(input: {
  userId: string;
  projectId: string;
  fileName: string;
}) {
  return `${input.userId}/${input.projectId}/${Date.now()}-${nanoid(8)}-${safeListingMediaFileName(input.fileName)}`;
}

export function validateListingMediaFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a listing photo to use as the authoritative source.", status: 400 } as const;
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Upload a supported listing photo: JPEG, PNG, or WebP.", status: 415 } as const;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Listing photo must be 10 MB or smaller.", status: 413 } as const;
  }

  return { ok: true, file: file as File & { type: "image/jpeg" | "image/png" | "image/webp" } } as const;
}
