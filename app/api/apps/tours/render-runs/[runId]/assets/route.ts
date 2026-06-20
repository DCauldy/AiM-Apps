import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import type { TourRenderRunAssetsResponse } from "@/lib/tours/rendering/contracts/render.contract";
import { listTourRenderRunAssetsWithUrls } from "@/lib/tours/rendering/runs/render-runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const assets = await listTourRenderRunAssetsWithUrls({
    runId,
    userId: access.user.id,
  });

  if (!assets) {
    return Response.json({ error: "Render run was not found." }, { status: 404 });
  }

  const payload = { assets } satisfies TourRenderRunAssetsResponse;

  return Response.json(payload);
}
