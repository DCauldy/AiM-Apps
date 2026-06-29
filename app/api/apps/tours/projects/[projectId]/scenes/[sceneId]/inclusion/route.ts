import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { toggleTourSceneInclusion } from "@/lib/tours/scenes";

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
  if (typeof body?.included !== "boolean") {
    return Response.json({ error: "Send whether this TourScene should be included." }, { status: 400 });
  }

  const result = await toggleTourSceneInclusion({ projectId, sceneId, included: body.included });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scene: result.scene });
}
