import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { approveAllTourSceneFactsForProject } from "@/lib/tours/facts";
import {
  formatTourVideoDownloadFilename,
  type TourRenderRunResponse,
  type TourRenderRunsResponse,
} from "@/lib/tours/rendering/tour-render.contract";
import {
  createTourRenderRun,
  getTourRenderRunResultUrl,
  listRecentTourRenderRuns,
  preflightTourRenderRun,
  toTourRenderRunStatusResponse,
  toTourRenderRunStatusResponseWithResultUrl,
} from "@/lib/tours/rendering/tour-render-runs";
import { mergeProjectAvatarSettingsIntoRenderOptions } from "@/lib/tours/rendering/avatar-project-render-options";
import { getTourRenderProjectSettings } from "@/lib/tours/rendering/tour-render-project-settings";
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
        downloadTitle: formatTourVideoDownloadFilename(access.project?.name),
      });

      return toTourRenderRunStatusResponseWithResultUrl(run, resultUrl);
    })
  );

  const payload = {
    runs: runsWithResultUrls,
  } satisfies TourRenderRunsResponse;

  return Response.json(payload);
}

type CreateRenderRunRequestBody = {
  options?: TourRenderOptions;
};

function mergeProjectRenderSettings(
  options: TourRenderOptions | undefined,
  settings: Awaited<ReturnType<typeof getTourRenderProjectSettings>>
): TourRenderOptions | undefined {
  const projectVoiceId = settings.elevenLabsVoiceId?.trim();
  const voiceOptions = projectVoiceId && !options?.elevenLabsVoiceId
    ? {
        ...(options ?? {}),
        elevenLabsVoiceId: projectVoiceId,
      }
    : options ?? {};

  const mergedOptions = mergeProjectAvatarSettingsIntoRenderOptions({
    options: voiceOptions,
    project: {
      heyGenAvatarId: settings.heyGenAvatarId,
      heyGenAvatarPlacement: settings.heyGenAvatarPlacement,
    },
  });

  return Object.keys(mergedOptions).length > 0 ? mergedOptions : undefined;
}

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

  await approveAllTourSceneFactsForProject({
    projectId,
    proofedBy: access.user.id,
  });
  const projectRenderSettings = await getTourRenderProjectSettings({
    projectId,
    userId: access.user.id,
  });
  const options = mergeProjectRenderSettings(body.options, projectRenderSettings);

  const preflight = await preflightTourRenderRun({
    projectId,
    userId: access.user.id,
    options,
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
      options,
    },
    { skipPreflight: true }
  );

  if (!run) {
    return Response.json(
      { error: "Tour project is not ready for rendering." },
      { status: 422 }
    );
  }

  const payload = {
    run: toTourRenderRunStatusResponse(run),
  } satisfies TourRenderRunResponse;

  return Response.json(payload, { status: 201 });
}
