"use client";

import type { TourProjectType } from "@/lib/tours/project-types";
import type {
  CreateTourProjectResponse,
  OpenTourProjectsResponse,
  TourProjectWorkspaceResponse,
  UpdateTourProjectResponse,
} from "@/lib/tours/project-api-contracts";
import type {
  TourRenderRunAssetResponse,
  TourRenderRunAssetsResponse,
  TourRenderRunResponse,
  TourRenderRunsResponse,
  TourRenderRunStatusResponse,
} from "@/lib/tours/rendering/tour-render.contract";
import type { TourRenderOptions } from "@/lib/tours/rendering/tour-render-preflight";
import type { TourSceneCameraMotion } from "@/lib/tours/scenes.core";
import type { TourSceneFact } from "@/lib/tours/workspace";
import type {
  ElevenLabsDigitalTwinVoice,
  ElevenLabsVoicesResponse,
  HeyGenAvatarLook,
  HeyGenAvatarsResponse,
} from "@/lib/tours/integration-picker-options";
import type { HeyGenAvatarProjectPosition } from "./workspace/avatar-positioning";

export type { OpenTourProject } from "@/lib/tours/project-api-contracts";
export type {
  ElevenLabsDigitalTwinVoice,
  HeyGenAvatarLook,
} from "@/lib/tours/integration-picker-options";

export type TourProjectDetailsUpdate = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
  elevenLabsVoiceId?: string | null;
  heyGenAvatarId?: string | null;
  heyGenAvatarPlacement?: HeyGenAvatarProjectPosition | null;
};

export type CreateTourProjectInput = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
  tourType: TourProjectType;
  elevenLabsVoiceId?: string | null;
  heyGenAvatarId?: string | null;
  heyGenAvatarPlacement?: HeyGenAvatarProjectPosition | null;
};

export type CreateRenderRunInput = {
  fresh?: boolean;
  options?: TourRenderOptions;
};

type SceneFactResponse = {
  fact: TourSceneFact;
};

type CreateSceneResponse = {
  scene?: {
    id?: string;
  };
};

export const FRESH_RENDER_OPTIONS = {
  reuseExistingAssets: false,
  reuse: {
    scriptPlan: false,
    voiceover: false,
    avatar: false,
    sceneClips: false,
    finalVideo: false,
  },
} as const;

export const tourQueryKeys = {
  openProjects: () => ["tours", "projects", "open"] as const,
  workspace: (projectId: string) => ["tours", "workspace", projectId] as const,
  renderRuns: (projectId: string) => ["tours", "render-runs", projectId] as const,
  renderRunStatus: (projectId: string, runId: string | null) =>
    ["tours", "render-runs", projectId, runId, "status"] as const,
  renderRunAssets: (runId: string) => ["tours", "render-runs", runId, "assets"] as const,
  elevenLabsDigitalTwinVoices: () => ["tours", "elevenlabs", "digital-twin-voices"] as const,
  heyGenAvatarLooks: () => ["tours", "heygen", "digital-twin-avatar-looks"] as const,
};

const encodeRouteSegment = (segment: string) => encodeURIComponent(segment);
const projectRoute = (projectId: string) =>
  `/api/apps/tours/projects/${encodeRouteSegment(projectId)}`;
const sceneRoute = (projectId: string, sceneId: string) =>
  `${projectRoute(projectId)}/scenes/${encodeRouteSegment(sceneId)}`;
const renderRunsRoute = (projectId: string) => `${projectRoute(projectId)}/render-runs`;

export const toursApiRoutes = {
  voices: () => "/api/apps/tours/voices",
  avatars: () => "/api/apps/tours/avatars",
  projects: () => "/api/apps/tours/projects",
  project: projectRoute,
  projectArchive: (projectId: string) => `${projectRoute(projectId)}/archive`,
  listingMediaAuthorization: (projectId: string) =>
    `${projectRoute(projectId)}/listing-media-authorization`,
  scenes: (projectId: string) => `${projectRoute(projectId)}/scenes`,
  scenesReorder: (projectId: string) => `${projectRoute(projectId)}/scenes/reorder`,
  scene: sceneRoute,
  sceneInclusion: (projectId: string, sceneId: string) =>
    `${sceneRoute(projectId, sceneId)}/inclusion`,
  scenePhoto: (projectId: string, sceneId: string, sourcePhotoId?: string | null) => {
    const base = `${sceneRoute(projectId, sceneId)}/photo`;
    return sourcePhotoId ? `${base}?sourcePhotoId=${encodeURIComponent(sourcePhotoId)}` : base;
  },
  sceneFacts: (projectId: string, sceneId: string) =>
    `${sceneRoute(projectId, sceneId)}/facts`,
  sceneFact: (projectId: string, sceneId: string, factId: string) =>
    `${sceneRoute(projectId, sceneId)}/facts/${encodeRouteSegment(factId)}`,
  renderRuns: renderRunsRoute,
  renderRunStatus: (projectId: string, runId: string) =>
    `${renderRunsRoute(projectId)}/${encodeRouteSegment(runId)}/status`,
  renderRunAssets: (runId: string) =>
    `/api/apps/tours/render-runs/${encodeRouteSegment(runId)}/assets`,
};

export async function readToursJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : fallbackError;
    throw new Error(message);
  }
  return payload as T;
}

export function buildCreateRenderRunRequestBody(input: CreateRenderRunInput = {}) {
  if (input.fresh) {
    return { options: FRESH_RENDER_OPTIONS };
  }

  return input.options ? { options: input.options } : {};
}

export async function fetchOpenTourProjects() {
  const response = await fetch(toursApiRoutes.projects());
  const payload = await readToursJsonResponse<OpenTourProjectsResponse>(
    response,
    "Could not load tour projects."
  );
  return payload.projects ?? [];
}

export async function createTourProject(input: CreateTourProjectInput) {
  const response = await fetch(toursApiRoutes.projects(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readToursJsonResponse<CreateTourProjectResponse>(
    response,
    "Could not create the tour project."
  );
}

export async function fetchTourProjectWorkspace(projectId: string) {
  const response = await fetch(toursApiRoutes.project(projectId));
  const payload = await readToursJsonResponse<TourProjectWorkspaceResponse>(
    response,
    "Could not load the tour project workspace."
  );
  return payload.workspace;
}

export async function acknowledgeListingMediaAuthorization(projectId: string) {
  const response = await fetch(toursApiRoutes.listingMediaAuthorization(projectId), {
    method: "POST",
  });
  return readToursJsonResponse(response, "Could not record listing-media authorization.");
}

export async function updateTourProjectDetails(
  projectId: string,
  details: TourProjectDetailsUpdate
) {
  const response = await fetch(toursApiRoutes.project(projectId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
  return readToursJsonResponse<UpdateTourProjectResponse>(
    response,
    "Could not update the tour project."
  );
}

export async function archiveTourProject(projectId: string) {
  const response = await fetch(toursApiRoutes.projectArchive(projectId), {
    method: "PATCH",
  });
  return readToursJsonResponse(response, "Could not delete the tour project.");
}

export async function createSceneFact(projectId: string, sceneId: string, text: string) {
  const response = await fetch(toursApiRoutes.sceneFacts(projectId, sceneId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return readToursJsonResponse<SceneFactResponse>(response, "Could not save the scene fact.");
}

export async function updateSceneFact(
  projectId: string,
  sceneId: string,
  factId: string,
  text: string
) {
  const response = await fetch(toursApiRoutes.sceneFact(projectId, sceneId, factId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return readToursJsonResponse<SceneFactResponse>(response, "Could not update the scene fact.");
}

export async function deleteSceneFact(projectId: string, sceneId: string, factId: string) {
  const response = await fetch(toursApiRoutes.sceneFact(projectId, sceneId, factId), {
    method: "DELETE",
  });
  return readToursJsonResponse(response, "Could not delete the scene fact.");
}

export async function createSceneFromListingPhoto(
  projectId: string,
  formData: FormData,
  fallbackError = "Could not create the TourScene."
) {
  const response = await fetch(toursApiRoutes.scenes(projectId), {
    method: "POST",
    body: formData,
  });
  return readToursJsonResponse<CreateSceneResponse>(response, fallbackError);
}

export async function replaceAuthoritativeSceneListingPhoto(
  projectId: string,
  sceneId: string,
  formData: FormData
) {
  const response = await fetch(toursApiRoutes.scenePhoto(projectId, sceneId), {
    method: "PATCH",
    body: formData,
  });
  return readToursJsonResponse(response, "Could not replace the authoritative listing photo.");
}

export async function addSceneListingPhoto(
  projectId: string,
  sceneId: string,
  formData: FormData
) {
  const response = await fetch(toursApiRoutes.scenePhoto(projectId, sceneId), {
    method: "POST",
    body: formData,
  });
  return readToursJsonResponse(response, "Could not add the listing photo.");
}

export async function removeSceneListingPhoto(
  projectId: string,
  sceneId: string,
  sourcePhotoId: string | null
) {
  const response = await fetch(toursApiRoutes.scenePhoto(projectId, sceneId, sourcePhotoId), {
    method: "DELETE",
  });
  return readToursJsonResponse(response, "Could not remove the listing photo.");
}

export async function reorderTourScenes(
  projectId: string,
  orderedSceneIds: string[],
  fallbackError = "Could not save the TourScene order."
) {
  const response = await fetch(toursApiRoutes.scenesReorder(projectId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedSceneIds }),
  });
  return readToursJsonResponse(response, fallbackError);
}

export async function toggleSceneInclusion(
  projectId: string,
  sceneId: string,
  included: boolean
) {
  const response = await fetch(toursApiRoutes.sceneInclusion(projectId, sceneId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ included }),
  });
  return readToursJsonResponse(response, "Could not update TourScene inclusion.");
}

export async function updateSceneCameraMotion(
  projectId: string,
  sceneId: string,
  cameraMotion: TourSceneCameraMotion
) {
  const response = await fetch(toursApiRoutes.scene(projectId, sceneId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraMotion }),
  });
  return readToursJsonResponse(response, "Could not update TourScene camera motion.");
}

export async function deleteTourScene(projectId: string, sceneId: string) {
  const response = await fetch(toursApiRoutes.scene(projectId, sceneId), {
    method: "DELETE",
  });
  return readToursJsonResponse(response, "Could not remove the TourScene.");
}

export async function fetchRecentRenderRuns(
  projectId: string
): Promise<TourRenderRunStatusResponse[]> {
  const response = await fetch(toursApiRoutes.renderRuns(projectId));
  const payload = await readToursJsonResponse<TourRenderRunsResponse>(
    response,
    "Could not load render status."
  );
  return payload.runs;
}

export async function fetchRenderRunStatus(
  projectId: string,
  runId: string
): Promise<TourRenderRunStatusResponse> {
  const response = await fetch(toursApiRoutes.renderRunStatus(projectId, runId));
  const payload = await readToursJsonResponse<TourRenderRunResponse>(
    response,
    "Could not load render status."
  );
  return payload.run;
}

export async function createRenderRun(
  projectId: string,
  input: CreateRenderRunInput = {}
): Promise<TourRenderRunStatusResponse> {
  const response = await fetch(toursApiRoutes.renderRuns(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCreateRenderRunRequestBody(input)),
  });
  const payload = await readToursJsonResponse<TourRenderRunResponse>(
    response,
    "Could not start rendering."
  );
  return payload.run;
}

export async function fetchTourRenderRunAssets(
  runId: string
): Promise<TourRenderRunAssetResponse[]> {
  const response = await fetch(toursApiRoutes.renderRunAssets(runId));
  const payload = await readToursJsonResponse<TourRenderRunAssetsResponse>(
    response,
    "Could not load render assets."
  );
  return payload.assets;
}

export async function fetchDigitalTwinVoices() {
  const response = await fetch(toursApiRoutes.voices());
  return readToursJsonResponse<ElevenLabsVoicesResponse>(
    response,
    "Could not load ElevenLabs voices."
  );
}

export async function fetchHeyGenAvatarLooks() {
  const response = await fetch(toursApiRoutes.avatars());
  return readToursJsonResponse<HeyGenAvatarsResponse>(
    response,
    "Could not load HeyGen avatars."
  );
}
