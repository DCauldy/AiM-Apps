"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TourSceneCameraMotion } from "@/lib/tours/scenes.core";
import type { SceneTransitionEffect } from "@/lib/tours/rendering/transitions/scene-transition-effects";
import type { TourScene } from "@/lib/tours/workspace";
import { useOptimisticSortableList } from "@/hooks/useOptimisticSortableList";
import {
  addSceneListingPhoto,
  createSceneFromListingPhoto,
  deleteTourScene,
  removeSceneListingPhoto,
  reorderTourScenes,
  replaceAuthoritativeSceneListingPhoto,
  toggleSceneInclusion,
  tourQueryKeys,
  updateSceneCameraMotion,
  updateSceneTransitionEffect,
} from "@/components/tours/tours-api-client";
import {
  addTourScenePhoto,
  appendTourScene,
  applyTourSceneOrder,
  applyTourScenePatch,
  removeTourScene,
  removeTourScenePhoto,
  replaceTourSceneAuthoritativePhoto,
  updateTourWorkspaceCache,
} from "./tourWorkspaceCache";

export function useTourSceneMutations({
  projectId,
  scenes,
  onSceneCreated,
  onScenePhotoReplaced,
  onAddPhotoSettled,
}: {
  projectId: string;
  scenes: TourScene[];
  onSceneCreated: (sceneId: string | null) => void;
  onScenePhotoReplaced: () => void;
  onAddPhotoSettled: () => void;
}) {
  const queryClient = useQueryClient();

  const invalidateWorkspace = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: tourQueryKeys.workspace(projectId),
    });
  }, [projectId, queryClient]);

  const createSceneMutation = useMutation({
    mutationFn: (formData: FormData) => createSceneFromListingPhoto(projectId, formData),
    onSuccess: (payload) => {
      const createdScene = payload?.scene;
      if (createdScene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          appendTourScene(workspace, createdScene)
        );
      } else {
        invalidateWorkspace();
      }
      onSceneCreated(typeof createdScene?.id === "string" ? createdScene.id : null);
    },
  });
  const replacePhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      replaceAuthoritativeSceneListingPhoto(projectId, sceneId, formData),
    onSuccess: (payload, variables) => {
      const authoritativePhoto = payload.authoritativePhoto;
      const scene = payload.scene;
      onScenePhotoReplaced();
      if (authoritativePhoto) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          replaceTourSceneAuthoritativePhoto(
            workspace,
            variables.sceneId,
            authoritativePhoto,
            scene
          )
        );
      } else if (scene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourScenePatch(workspace, scene)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const addPhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      addSceneListingPhoto(projectId, sceneId, formData),
    onSuccess: (payload, variables) => {
      const sourcePhoto = payload.sourcePhoto;
      const scene = payload.scene;
      if (sourcePhoto) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          addTourScenePhoto(workspace, variables.sceneId, sourcePhoto, scene)
        );
      } else if (scene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourScenePatch(workspace, scene)
        );
      } else {
        invalidateWorkspace();
      }
    },
    onSettled: onAddPhotoSettled,
  });
  const removePhotoMutation = useMutation({
    mutationFn: ({ sceneId, sourcePhotoId }: { sceneId: string; sourcePhotoId: string | null }) =>
      removeSceneListingPhoto(projectId, sceneId, sourcePhotoId),
    onSuccess: (payload, variables) => {
      const removedPhotoId = payload.removedPhotoId;
      if (removedPhotoId) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          removeTourScenePhoto(workspace, variables.sceneId, removedPhotoId)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const reorderScenesMutation = useMutation({
    mutationFn: (orderedSceneIds: string[]) => reorderTourScenes(projectId, orderedSceneIds),
    onSuccess: (payload) => {
      const orderedScenes = payload.scenes;
      if (orderedScenes) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourSceneOrder(workspace, orderedScenes)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const persistSceneOrder = useCallback(
    (orderedSceneIds: string[]) => reorderScenesMutation.mutateAsync(orderedSceneIds),
    [reorderScenesMutation]
  );
  const tourScenes = useOptimisticSortableList({
    items: scenes,
    getId: useCallback((scene: TourScene) => scene.id, []),
    getSyncKey: useCallback(
      (scene: TourScene) =>
        `${scene.title}\u001e${scene.sortOrder}\u001e${scene.included}\u001e${scene.cameraMotion}\u001e${scene.transitionEffect}\u001e${scene.authoritativePhoto.previewUrl ?? ""}\u001e${scene.sourcePhotos.map((photo) => `${photo.id}:${photo.previewUrl ?? ""}`).join("\u001d")}\u001e${scene.facts.map((fact) => `${fact.id}:${fact.text}:${fact.sortOrder}`).join("\u001d")}`,
      []
    ),
    isLocked: reorderScenesMutation.isPending,
    onPersistOrder: persistSceneOrder,
  });
  const toggleSceneInclusionMutation = useMutation({
    mutationFn: ({ sceneId, included }: { sceneId: string; included: boolean }) =>
      toggleSceneInclusion(projectId, sceneId, included),
    onSuccess: (payload) => {
      const scene = payload.scene;
      if (scene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourScenePatch(workspace, scene)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const updateSceneCameraMotionMutation = useMutation({
    mutationFn: ({ sceneId, cameraMotion }: { sceneId: string; cameraMotion: TourSceneCameraMotion }) =>
      updateSceneCameraMotion(projectId, sceneId, cameraMotion),
    onSuccess: (payload) => {
      const scene = payload.scene;
      if (scene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourScenePatch(workspace, scene)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const updateSceneTransitionEffectMutation = useMutation({
    mutationFn: ({
      sceneId,
      transitionEffect,
    }: {
      sceneId: string;
      transitionEffect: SceneTransitionEffect;
    }) => updateSceneTransitionEffect(projectId, sceneId, transitionEffect),
    onSuccess: (payload) => {
      const scene = payload.scene;
      if (scene) {
        updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
          applyTourScenePatch(workspace, scene)
        );
      } else {
        invalidateWorkspace();
      }
    },
  });
  const deleteSceneMutation = useMutation({
    mutationFn: (sceneId: string) => deleteTourScene(projectId, sceneId),
    onSuccess: (payload, sceneId) => {
      updateTourWorkspaceCache(queryClient, projectId, (workspace) =>
        removeTourScene(workspace, payload.removedSceneId ?? sceneId)
      );
    },
  });

  const toggleInclusion = useCallback(
    async (sceneId: string, included: boolean) => {
      const previousScene = tourScenes.items.find((scene) => scene.id === sceneId);
      tourScenes.updateItem(sceneId, (scene) => ({
        ...scene,
        included,
        status: included ? "ready" : "skipped",
      }));

      try {
        await toggleSceneInclusionMutation.mutateAsync({ sceneId, included });
      } catch {
        if (previousScene) {
          tourScenes.updateItem(sceneId, () => previousScene);
        }
      }
    },
    [toggleSceneInclusionMutation, tourScenes]
  );

  const updateCameraMotion = useCallback(
    async (sceneId: string, cameraMotion: TourSceneCameraMotion) => {
      const previousScene = tourScenes.items.find((scene) => scene.id === sceneId);
      tourScenes.updateItem(sceneId, (scene) => ({
        ...scene,
        cameraMotion,
      }));

      try {
        await updateSceneCameraMotionMutation.mutateAsync({ sceneId, cameraMotion });
      } catch {
        if (previousScene) {
          tourScenes.updateItem(sceneId, () => previousScene);
        }
      }
    },
    [tourScenes, updateSceneCameraMotionMutation]
  );

  const updateTransitionEffect = useCallback(
    async (sceneId: string, transitionEffect: SceneTransitionEffect) => {
      const previousScene = tourScenes.items.find((scene) => scene.id === sceneId);
      tourScenes.updateItem(sceneId, (scene) => ({
        ...scene,
        transitionEffect,
      }));

      try {
        await updateSceneTransitionEffectMutation.mutateAsync({ sceneId, transitionEffect });
      } catch {
        if (previousScene) {
          tourScenes.updateItem(sceneId, () => previousScene);
        }
      }
    },
    [tourScenes, updateSceneTransitionEffectMutation]
  );

  return {
    tourScenes,
    createScene: createSceneMutation.mutate,
    replacePhoto: replacePhotoMutation.mutate,
    addPhoto: addPhotoMutation.mutate,
    removePhoto: removePhotoMutation.mutate,
    reorderById: tourScenes.reorderById,
    toggleInclusion,
    updateCameraMotion,
    updateTransitionEffect,
    deleteScene: deleteSceneMutation.mutateAsync,
    mutations: {
      createScene: createSceneMutation,
      replacePhoto: replacePhotoMutation,
      addPhoto: addPhotoMutation,
      removePhoto: removePhotoMutation,
      reorderScenes: reorderScenesMutation,
      toggleSceneInclusion: toggleSceneInclusionMutation,
      updateSceneCameraMotion: updateSceneCameraMotionMutation,
      updateSceneTransitionEffect: updateSceneTransitionEffectMutation,
      deleteScene: deleteSceneMutation,
    },
  };
}
