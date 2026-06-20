import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  formatTourVideoDownloadFilename,
  type TourRenderRunResponse,
} from "@/lib/tours/rendering/contracts/tour-render.contract";
import {
  getTourRenderRunResultUrl,
  getTourRenderRunStatus,
  toTourRenderRunStatusResponseWithResultUrl,
} from "@/lib/tours/rendering/runs/tour-render-runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const { projectId, runId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const run = await getTourRenderRunStatus({
    projectId,
    runId,
    userId: access.user.id,
  });

  if (!run) {
    return Response.json({ error: "Render run was not found." }, { status: 404 });
  }

  const resultUrl = await getTourRenderRunResultUrl({
    projectId,
    runId,
    userId: access.user.id,
    resultAssetId: run.resultAssetId,
    downloadTitle: formatTourVideoDownloadFilename(access.project?.name),
  });

  const payload = {
    run: toTourRenderRunStatusResponseWithResultUrl(run, resultUrl),
  } satisfies TourRenderRunResponse;

  return Response.json(payload);
}
