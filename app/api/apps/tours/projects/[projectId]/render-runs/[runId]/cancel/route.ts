import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import {
  cancelTourRenderRun,
  toTourRenderRunStatusResponse,
} from "@/lib/tours/rendering/runs/render-runs";
import type { TourRenderRunResponse } from "@/lib/tours/rendering/contracts/render.contract";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const { projectId, runId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const run = await cancelTourRenderRun({
    projectId,
    runId,
    userId: access.user.id,
  });

  if (!run) {
    return Response.json(
      { error: "Render run is no longer active or was not found." },
      { status: 409 }
    );
  }

  const payload = {
    run: toTourRenderRunStatusResponse(run),
  } satisfies TourRenderRunResponse;

  return Response.json(payload);
}
