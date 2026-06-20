import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { getListingMediaAcknowledgementForProject } from "@/lib/tours/listing-media/listing-media-authorization";
import { createTourSceneFromAuthoritativePhoto } from "@/lib/tours/scenes";
import {
  LISTING_MEDIA_BUCKET,
  getListingMediaStoragePath,
  validateListingMediaFile,
} from "@/lib/tours/listing-media/listing-media-upload";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const acknowledgement = await getListingMediaAcknowledgementForProject(projectId);
  if (!acknowledgement) {
    return Response.json(
      { error: "Acknowledge listing-media authorization before submitting images for this Tour Project." },
      { status: 403 }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Submit a listing photo and TourScene title." }, { status: 400 });
  }

  const title = String(formData.get("title") ?? "").trim();
  const fileValidation = validateListingMediaFile(formData.get("photo"));

  if (!title) {
    return Response.json({ error: "Enter a TourScene title." }, { status: 400 });
  }

  if (!fileValidation.ok) {
    return Response.json({ error: fileValidation.error }, { status: fileValidation.status });
  }

  const file = fileValidation.file;
  const storagePath = getListingMediaStoragePath({
    userId: access.user.id,
    projectId,
    fileName: file.name,
  });
  const { error: uploadError } = await access.supabase.storage
    .from(LISTING_MEDIA_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: "Could not upload the listing photo. Please try again." }, { status: 500 });
  }

  const result = await createTourSceneFromAuthoritativePhoto({
    projectId,
    title,
    sourcePhoto: {
      storagePath,
      fileName: file.name,
      contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      byteSize: file.size,
    },
  });

  if (!result.ok) {
    await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([storagePath]);
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scene: result.scene }, { status: 201 });
}
