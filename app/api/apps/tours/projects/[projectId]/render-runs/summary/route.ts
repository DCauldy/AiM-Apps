import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import type { TourRenderRunsSummaryResponse } from "@/lib/tours/rendering/contracts/render.contract";
import {
  getTourRenderRunsSummary,
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

  const summary = await getTourRenderRunsSummary({
    projectId,
    userId: access.user.id,
  });

  const payload = {
    activeRun: summary.activeRun
      ? toTourRenderRunStatusResponse(summary.activeRun)
      : null,
    latestDownloadableRun: summary.latestDownloadableRun
      ? toTourRenderRunStatusResponse(summary.latestDownloadableRun)
      : null,
  } satisfies TourRenderRunsSummaryResponse;

  return Response.json(payload);
}
