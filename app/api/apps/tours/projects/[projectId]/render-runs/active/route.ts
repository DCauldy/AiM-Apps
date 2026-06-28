import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import type { TourActiveRenderRunResponse } from "@/lib/tours/rendering/contracts/render.contract";
import {
  getActiveTourRenderRun,
  toTourRenderRunStatusResponse,
} from "@/lib/tours/rendering/runs/render-runs";

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

  const activeRun = await getActiveTourRenderRun({
    projectId,
    userId: access.user.id,
  });

  const payload = {
    activeRun: activeRun ? toTourRenderRunStatusResponse(activeRun) : null,
  } satisfies TourActiveRenderRunResponse;

  return Response.json(payload);
}
