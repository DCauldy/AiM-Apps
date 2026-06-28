"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { UpdatedTourProject } from "@/lib/tours/projects/project-api-contracts";
import type { TourSceneModel } from "@/lib/tours/scenes.core";
import type {
  TourProjectWorkspaceViewModel,
  TourScene,
  TourSceneFact,
} from "@/lib/tours/workspace";
import { tourQueryKeys } from "@/components/tours/tours-api-client";

type WorkspaceScenePhoto = TourScene["sourcePhotos"][number];
type ScenePatch = Partial<Omit<TourScene, "id">> & Pick<TourScene, "id">;

function getSceneReadinessStatus(scenes: Array<{ included: boolean }>) {
  if (scenes.some((scene) => scene.included)) {
    return "ready" as const;
  }

  return scenes.length > 0 ? ("skipped" as const) : ("not_started" as const);
}

function withSceneReadiness(
  workspace: TourProjectWorkspaceViewModel,
  tourScenes: TourScene[]
): TourProjectWorkspaceViewModel {
  const sceneReadiness = getSceneReadinessStatus(tourScenes);

  return {
    ...workspace,
    tourScenes,
    readiness: {
      ...workspace.readiness,
      media: sceneReadiness,
      scenePlan: sceneReadiness,
    },
  };
}

function isWorkspacePhoto(photo: unknown): photo is WorkspaceScenePhoto {
  if (!photo || typeof photo !== "object") {
    return false;
  }

  const candidate = photo as Partial<WorkspaceScenePhoto>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.storagePath === "string" &&
    typeof candidate.contentType === "string"
  );
}

function mergeScenePhotos(
  existingPhotos: WorkspaceScenePhoto[],
  incomingPhotos: unknown
) {
  if (!Array.isArray(incomingPhotos) || !incomingPhotos.every(isWorkspacePhoto)) {
    return existingPhotos;
  }

  const existingById = new Map(existingPhotos.map((photo) => [photo.id, photo]));
  return incomingPhotos.map((photo) => ({
    ...photo,
    previewUrl: photo.previewUrl ?? existingById.get(photo.id)?.previewUrl ?? null,
  }));
}

function mergeWorkspaceScene(
  existingScene: TourScene,
  incomingScene: ScenePatch | TourSceneModel
): TourScene {
  const sourcePhotos = mergeScenePhotos(
    existingScene.sourcePhotos,
    "sourcePhotos" in incomingScene ? incomingScene.sourcePhotos : undefined
  );
  const incomingAuthoritativePhoto =
    "authoritativePhoto" in incomingScene && isWorkspacePhoto(incomingScene.authoritativePhoto)
      ? incomingScene.authoritativePhoto
      : null;
  const authoritativePhoto =
    incomingAuthoritativePhoto
      ? {
          ...incomingAuthoritativePhoto,
          previewUrl:
            incomingAuthoritativePhoto.previewUrl ??
            existingScene.sourcePhotos.find((photo) => photo.id === incomingAuthoritativePhoto.id)?.previewUrl ??
            existingScene.authoritativePhoto.previewUrl ??
            null,
        }
      : sourcePhotos.find((photo) => photo.id === existingScene.authoritativePhoto.id) ??
        existingScene.authoritativePhoto;
  const included =
    "included" in incomingScene && typeof incomingScene.included === "boolean"
      ? incomingScene.included
      : existingScene.included;

  return {
    ...existingScene,
    ...incomingScene,
    authoritativePhoto,
    sourcePhotos,
    facts: "facts" in incomingScene && Array.isArray(incomingScene.facts)
      ? incomingScene.facts
      : existingScene.facts,
    hasProofedContext:
      "hasProofedContext" in incomingScene && typeof incomingScene.hasProofedContext === "boolean"
        ? incomingScene.hasProofedContext
        : existingScene.hasProofedContext,
    status: included ? "ready" : "skipped",
  };
}

function patchSceneFacts(
  scene: TourScene,
  facts: TourSceneFact[]
): TourScene {
  return {
    ...scene,
    facts,
    hasProofedContext: facts.some((fact) => fact.proofStatus === "proofed"),
  };
}

export function applyTourScenePatch(
  workspace: TourProjectWorkspaceViewModel,
  incomingScene: ScenePatch | TourSceneModel
): TourProjectWorkspaceViewModel {
  const existingScene = workspace.tourScenes.find((scene) => scene.id === incomingScene.id);
  if (!existingScene) {
    return workspace;
  }

  return withSceneReadiness(
    workspace,
    workspace.tourScenes.map((scene) =>
      scene.id === incomingScene.id ? mergeWorkspaceScene(scene, incomingScene) : scene
    )
  );
}

export function appendTourScene(
  workspace: TourProjectWorkspaceViewModel,
  scene: TourScene
): TourProjectWorkspaceViewModel {
  return withSceneReadiness(
    workspace,
    [...workspace.tourScenes, scene].sort((a, b) => a.sortOrder - b.sortOrder)
  );
}

export function applyTourSceneOrder(
  workspace: TourProjectWorkspaceViewModel,
  incomingScenes: TourSceneModel[]
): TourProjectWorkspaceViewModel {
  const incomingById = new Map(incomingScenes.map((scene) => [scene.id, scene]));
  const orderedSceneIds = incomingScenes.map((scene) => scene.id);

  if (orderedSceneIds.length !== workspace.tourScenes.length) {
    return workspace;
  }

  const nextScenes = orderedSceneIds.map((sceneId, index) => {
    const existingScene = workspace.tourScenes.find((scene) => scene.id === sceneId);
    const incomingScene = incomingById.get(sceneId);
    if (!existingScene || !incomingScene) {
      return null;
    }

    return mergeWorkspaceScene(existingScene, {
      ...incomingScene,
      sortOrder: index,
    });
  });

  if (nextScenes.some((scene) => !scene)) {
    return workspace;
  }

  return withSceneReadiness(workspace, nextScenes as TourScene[]);
}

export function removeTourScene(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string
): TourProjectWorkspaceViewModel {
  return withSceneReadiness(
    workspace,
    workspace.tourScenes.filter((scene) => scene.id !== sceneId)
  );
}

export function addTourScenePhoto(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string,
  photo: WorkspaceScenePhoto,
  incomingScene?: TourSceneModel
): TourProjectWorkspaceViewModel {
  const patchedWorkspace = incomingScene
    ? applyTourScenePatch(workspace, incomingScene)
    : workspace;
  const scene = patchedWorkspace.tourScenes.find((workspaceScene) => workspaceScene.id === sceneId);
  if (!scene) {
    return patchedWorkspace;
  }

  const sourcePhotos = scene.sourcePhotos.some((sourcePhoto) => sourcePhoto.id === photo.id)
    ? scene.sourcePhotos.map((sourcePhoto) => (sourcePhoto.id === photo.id ? photo : sourcePhoto))
    : [...scene.sourcePhotos, photo];

  return applyTourScenePatch(patchedWorkspace, {
    id: sceneId,
    sourcePhotos,
  });
}

export function replaceTourSceneAuthoritativePhoto(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string,
  photo: WorkspaceScenePhoto,
  incomingScene?: TourSceneModel
): TourProjectWorkspaceViewModel {
  const patchedWorkspace = incomingScene
    ? applyTourScenePatch(workspace, incomingScene)
    : workspace;
  const scene = patchedWorkspace.tourScenes.find((workspaceScene) => workspaceScene.id === sceneId);
  if (!scene) {
    return patchedWorkspace;
  }

  const sourcePhotos = scene.sourcePhotos.some((sourcePhoto) => sourcePhoto.id === photo.id)
    ? scene.sourcePhotos.map((sourcePhoto) => (sourcePhoto.id === photo.id ? photo : sourcePhoto))
    : [photo, ...scene.sourcePhotos];

  return applyTourScenePatch(patchedWorkspace, {
    id: sceneId,
    authoritativePhoto: photo,
    sourcePhotos,
  });
}

export function upsertTourSceneFact(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string,
  fact: TourSceneFact
): TourProjectWorkspaceViewModel {
  return {
    ...workspace,
    tourScenes: workspace.tourScenes.map((scene) => {
      if (scene.id !== sceneId) {
        return scene;
      }

      const hasFact = scene.facts.some((existingFact) => existingFact.id === fact.id);
      const facts = hasFact
        ? scene.facts.map((existingFact) => (existingFact.id === fact.id ? fact : existingFact))
        : [...scene.facts, fact];

      return patchSceneFacts(scene, facts);
    }),
  };
}

export function removeTourSceneFact(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string,
  factId: string
): TourProjectWorkspaceViewModel {
  return {
    ...workspace,
    tourScenes: workspace.tourScenes.map((scene) =>
      scene.id === sceneId
        ? patchSceneFacts(
            scene,
            scene.facts.filter((fact) => fact.id !== factId)
          )
        : scene
    ),
  };
}

export function removeTourScenePhoto(
  workspace: TourProjectWorkspaceViewModel,
  sceneId: string,
  photoId: string
): TourProjectWorkspaceViewModel {
  const scene = workspace.tourScenes.find((workspaceScene) => workspaceScene.id === sceneId);
  if (!scene) {
    return workspace;
  }

  const sourcePhotos = scene.sourcePhotos.filter((photo) => photo.id !== photoId);
  if (sourcePhotos.length === 0) {
    return workspace;
  }

  const authoritativePhoto =
    scene.authoritativePhoto.id === photoId
      ? sourcePhotos[0] ?? scene.authoritativePhoto
      : scene.authoritativePhoto;

  return applyTourScenePatch(workspace, {
    id: sceneId,
    authoritativePhoto,
    sourcePhotos,
  });
}

export function applyTourProjectDetails(
  workspace: TourProjectWorkspaceViewModel,
  project: UpdatedTourProject
): TourProjectWorkspaceViewModel {
  return {
    ...workspace,
    project: {
      ...workspace.project,
      name: project.name,
      tourType: project.tour_type,
      elevenLabsVoiceId: project.elevenlabs_voice_id,
      heyGenAvatarId: project.heygen_avatar_id,
      heyGenAvatarPlacement: project.heygen_avatar_placement,
      updatedAt: project.updated_at,
    },
    listing: {
      ...workspace.listing,
      address: project.property_address,
      listingUrl: project.listing_url,
    },
  };
}

export function updateTourWorkspaceCache(
  queryClient: QueryClient,
  projectId: string,
  updater: (
    workspace: TourProjectWorkspaceViewModel
  ) => TourProjectWorkspaceViewModel
) {
  queryClient.setQueryData<TourProjectWorkspaceViewModel>(
    tourQueryKeys.workspace(projectId),
    (workspace) => (workspace ? updater(workspace) : workspace)
  );
}
