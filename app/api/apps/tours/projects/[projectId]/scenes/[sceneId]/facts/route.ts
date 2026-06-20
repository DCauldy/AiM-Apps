import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { createHumanTourSceneFact, listTourSceneFactsForScene } from "@/lib/tours/facts/facts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const facts = await listTourSceneFactsForScene({ projectId, sceneId });
  return Response.json({ facts }, { status: 200 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const payload = await request.json().catch(() => null);
  const text = typeof payload?.text === "string" ? payload.text : "";
  const result = await createHumanTourSceneFact({
    projectId,
    sceneId,
    text,
    proofedBy: access.user.id,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ fact: result.fact }, { status: 201 });
}
