import "server-only";

import { nanoid } from "nanoid";

export const LISTING_MEDIA_BUCKET = "tours-listing-media";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

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

function getImageTypeFromMagicBytes(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export async function validateListingMediaFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a listing photo to use as the authoritative source.", status: 400 } as const;
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Upload a supported listing photo: JPEG, PNG, or WebP.", status: 415 } as const;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Listing photo must be 10 MB or smaller.", status: 413 } as const;
  }

  const detectedType = getImageTypeFromMagicBytes(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (detectedType !== file.type) {
    return { ok: false, error: "Upload a supported listing photo: JPEG, PNG, or WebP.", status: 415 } as const;
  }

  return { ok: true, file: file as File & { type: SupportedImageType } } as const;
}
