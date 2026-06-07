"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TourScene } from "@/lib/tours/workspace";
import { useOptimisticSortableList } from "@/hooks/useOptimisticSortableList";

async function createSceneFromListingPhoto(projectId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not create the TourScene.");
  }
  return payload;
}

async function replaceAuthoritativeSceneListingPhoto(projectId: string, sceneId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, {
    method: "PATCH",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not replace the authoritative listing photo.");
  }
  return payload;
}

async function addSceneListingPhoto(projectId: string, sceneId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not add the listing photo.");
  }
  return payload;
}

async function removeSceneListingPhoto(projectId: string, sceneId: string, sourcePhotoId: string | null) {
  const url = new URL(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, window.location.origin);
  if (sourcePhotoId) {
    url.searchParams.set("sourcePhotoId", sourcePhotoId);
  }

  const response = await fetch(url, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not remove the listing photo.");
  }
  return payload;
}

async function reorderTourScenes(projectId: string, orderedSceneIds: string[]) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedSceneIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save the TourScene order.");
  }
  return payload;
}

async function toggleSceneInclusion(projectId: string, sceneId: string, included: boolean) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/inclusion`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ included }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not update TourScene inclusion.");
  }
  return payload;
}

async function deleteTourScene(projectId: string, sceneId: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not remove the TourScene.");
  }
  return payload;
}

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
  const router = useRouter();
  const queryClient = useQueryClient();

  const invalidateWorkspace = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["tours", "workspace", projectId],
    });
    router.refresh();
  }, [projectId, queryClient, router]);

  const createSceneMutation = useMutation({
    mutationFn: (formData: FormData) => createSceneFromListingPhoto(projectId, formData),
    onSuccess: (payload) => {
      onSceneCreated(typeof payload?.scene?.id === "string" ? payload.scene.id : null);
      invalidateWorkspace();
    },
  });
  const replacePhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      replaceAuthoritativeSceneListingPhoto(projectId, sceneId, formData),
    onSuccess: () => {
      onScenePhotoReplaced();
      invalidateWorkspace();
    },
  });
  const addPhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      addSceneListingPhoto(projectId, sceneId, formData),
    onSuccess: invalidateWorkspace,
    onSettled: onAddPhotoSettled,
  });
  const removePhotoMutation = useMutation({
    mutationFn: ({ sceneId, sourcePhotoId }: { sceneId: string; sourcePhotoId: string | null }) =>
      removeSceneListingPhoto(projectId, sceneId, sourcePhotoId),
    onSuccess: invalidateWorkspace,
  });
  const reorderScenesMutation = useMutation({
    mutationFn: (orderedSceneIds: string[]) => reorderTourScenes(projectId, orderedSceneIds),
    onSuccess: invalidateWorkspace,
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
        `${scene.title}\u001e${scene.sortOrder}\u001e${scene.included}\u001e${scene.cameraMotion}\u001e${scene.authoritativePhoto.previewUrl ?? ""}\u001e${scene.sourcePhotos.map((photo) => `${photo.id}:${photo.previewUrl ?? ""}`).join("\u001d")}\u001e${scene.facts.map((fact) => `${fact.id}:${fact.text}:${fact.sortOrder}`).join("\u001d")}`,
      []
    ),
    isLocked: reorderScenesMutation.isPending,
    onPersistOrder: persistSceneOrder,
  });
  const toggleSceneInclusionMutation = useMutation({
    mutationFn: ({ sceneId, included }: { sceneId: string; included: boolean }) =>
      toggleSceneInclusion(projectId, sceneId, included),
    onSuccess: invalidateWorkspace,
  });
  const deleteSceneMutation = useMutation({
    mutationFn: (sceneId: string) => deleteTourScene(projectId, sceneId),
    onSuccess: invalidateWorkspace,
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

  return {
    tourScenes,
    createScene: createSceneMutation.mutate,
    replacePhoto: replacePhotoMutation.mutate,
    addPhoto: addPhotoMutation.mutate,
    removePhoto: removePhotoMutation.mutate,
    reorderById: tourScenes.reorderById,
    toggleInclusion,
    deleteScene: deleteSceneMutation.mutateAsync,
    mutations: {
      createScene: createSceneMutation,
      replacePhoto: replacePhotoMutation,
      addPhoto: addPhotoMutation,
      removePhoto: removePhotoMutation,
      reorderScenes: reorderScenesMutation,
      toggleSceneInclusion: toggleSceneInclusionMutation,
      deleteScene: deleteSceneMutation,
    },
  };
}
