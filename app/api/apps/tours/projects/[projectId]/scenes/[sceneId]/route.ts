import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { deleteTourScene, updateTourSceneCameraMotion } from "@/lib/tours/scenes";
import { isTourSceneCameraMotion } from "@/lib/tours/scenes.core";
import { LISTING_MEDIA_BUCKET } from "@/lib/tours/listing-media/listing-media-upload";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => null);
  const cameraMotion = body?.cameraMotion;
  if (!isTourSceneCameraMotion(cameraMotion)) {
    return Response.json({ error: "Choose a valid camera motion." }, { status: 400 });
  }

  const result = await updateTourSceneCameraMotion({ projectId, sceneId, cameraMotion });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scene: result.scene });
}

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
