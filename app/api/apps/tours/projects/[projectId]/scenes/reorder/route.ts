import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { reorderTourScenes } from "@/lib/tours/scenes";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => null);
  const orderedSceneIds = body?.orderedSceneIds;
  if (!Array.isArray(orderedSceneIds) || !orderedSceneIds.every((id) => typeof id === "string" && id.length > 0)) {
    return Response.json({ error: "Send a valid TourScene order." }, { status: 400 });
  }

  const result = await reorderTourScenes({ projectId, orderedSceneIds });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scenes: result.scenes });
}
