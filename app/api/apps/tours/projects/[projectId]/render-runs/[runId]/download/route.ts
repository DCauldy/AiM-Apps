import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { formatTourVideoDownloadFilename } from "@/lib/tours/rendering/contracts/render.contract";
import {
  getTourRenderRunResultUrl,
  getTourRenderRunStatus,
} from "@/lib/tours/rendering/runs/render-runs";

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

  if (!run || run.status !== "completed") {
    return Response.json({ error: "Completed render was not found." }, { status: 404 });
  }

  const resultUrl = await getTourRenderRunResultUrl({
    projectId,
    runId,
    userId: access.user.id,
    resultAssetId: run.resultAssetId,
    downloadTitle: formatTourVideoDownloadFilename(access.project?.name),
  });

  if (!resultUrl) {
    return Response.json({ error: "Render download is not available." }, { status: 404 });
  }

  return Response.redirect(resultUrl.downloadUrl, 302);
}
