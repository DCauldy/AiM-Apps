import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  createFakeTourRenderRun,
  listRecentTourRenderRuns,
  toTourRenderRunStatusResponse,
} from "@/lib/tours/rendering/tour-render-runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const runs = await listRecentTourRenderRuns({
    projectId,
    userId: access.user.id,
    limit: 5,
  });

  return Response.json({
    runs: runs.map(toTourRenderRunStatusResponse),
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const run = await createFakeTourRenderRun({
    projectId,
    userId: access.user.id,
  });

  if (!run) {
    return Response.json(
      { error: "Tour project is not ready for rendering." },
      { status: 422 }
    );
  }

  return Response.json(
    {
      run: toTourRenderRunStatusResponse(run),
    },
    { status: 201 }
  );
}
