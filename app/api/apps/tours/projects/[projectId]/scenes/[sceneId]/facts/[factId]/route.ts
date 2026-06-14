import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { deleteTourSceneFact, updateHumanTourSceneFact } from "@/lib/tours/facts";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string; factId: string }> }
) {
  const { projectId, sceneId, factId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const payload = await request.json().catch(() => null);
  const text = typeof payload?.text === "string" ? payload.text : "";
  const result = await updateHumanTourSceneFact({
    projectId,
    sceneId,
    factId,
    text,
    proofedBy: access.user.id,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ fact: result.fact }, { status: 200 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string; factId: string }> }
) {
  const { projectId, sceneId, factId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const result = await deleteTourSceneFact({ projectId, sceneId, factId });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ factId: result.factId }, { status: 200 });
}
