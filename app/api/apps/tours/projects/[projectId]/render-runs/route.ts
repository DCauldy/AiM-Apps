import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  createTourRenderRun,
  getTourRenderRunResultUrl,
  listRecentTourRenderRuns,
  preflightTourRenderRun,
  toTourRenderRunStatusResponse,
  toTourRenderRunStatusResponseWithResultUrl,
} from "@/lib/tours/rendering/tour-render-runs";
import type { TourRenderOptions } from "@/lib/tours/rendering/tour-render-preflight";

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
  const runsWithResultUrls = await Promise.all(
    runs.map(async (run) => {
      const resultUrl = await getTourRenderRunResultUrl({
        projectId,
        runId: run.id,
        userId: access.user.id,
        resultAssetId: run.resultAssetId,
      });

      return toTourRenderRunStatusResponseWithResultUrl(run, resultUrl);
    })
  );

  return Response.json({
    runs: runsWithResultUrls,
  });
}

type CreateRenderRunRequestBody = {
  options?: TourRenderOptions;
};

async function readCreateRenderRunRequestBody(request: Request): Promise<CreateRenderRunRequestBody> {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  return {
    options:
      "options" in payload &&
      payload.options &&
      typeof payload.options === "object" &&
      !Array.isArray(payload.options)
        ? (payload.options as TourRenderOptions)
        : undefined,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await readCreateRenderRunRequestBody(request);
  const access = await requireToursAccess({ projectId });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const preflight = await preflightTourRenderRun({
    projectId,
    userId: access.user.id,
    options: body.options,
  });
  if (!preflight.ok) {
    return Response.json(
      { error: "Tour project is not ready for rendering.", preflight },
      { status: 422 }
    );
  }

  const run = await createTourRenderRun(
    {
      projectId,
      userId: access.user.id,
      options: body.options,
    },
    { skipPreflight: true }
  );

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
