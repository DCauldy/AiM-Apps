import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { deleteTourScene } from "@/lib/tours/scenes";
import { LISTING_MEDIA_BUCKET } from "@/lib/tours/listing-media-upload";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const result = await deleteTourScene({ projectId, sceneId });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  if (result.storagePaths.length > 0) {
    await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove(result.storagePaths);
  }

  return Response.json({ removedSceneId: sceneId });
}
