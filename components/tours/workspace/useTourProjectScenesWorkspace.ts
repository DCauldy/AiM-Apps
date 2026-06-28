"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  TourProjectWorkspaceViewModel,
  TourScene,
} from "@/lib/tours/workspace";
import {
  createSceneFact,
  deleteSceneFact,
  updateSceneFact,
} from "@/components/tours/tours-api-client";
import { useSourcePhotoSelection } from "./useSourcePhotoSelection";
import { useTourSceneMutations } from "./useTourSceneMutations";

export function useTourProjectScenesWorkspace({
  viewModel,
  invalidateWorkspace,
  initialSceneId,
  onActiveSceneIdChange,
}: {
  viewModel: TourProjectWorkspaceViewModel;
  invalidateWorkspace: () => void;
  initialSceneId?: string | null;
  onActiveSceneIdChange?: (sceneId: string | null) => void;
}) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    initialSceneId ?? viewModel.tourScenes[0]?.id ?? null,
  );
  const [pendingActiveSceneId, setPendingActiveSceneId] = useState<
    string | null
  >(null);
  const [isReturningToProjectGrid, setIsReturningToProjectGrid] =
    useState(false);
  const [isAddSceneOpen, setIsAddSceneOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<TourScene | null>(null);
  const [sceneToReplacePhoto, setSceneToReplacePhoto] =
    useState<TourScene | null>(null);
  const [sceneTitle, setSceneTitle] = useState("");
  const [scenePhoto, setScenePhoto] = useState<File | null>(null);
  const [scenePhotoPreviewUrl, setScenePhotoPreviewUrl] = useState<
    string | null
  >(null);
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null);
  const [replacementPhotoPreviewUrl, setReplacementPhotoPreviewUrl] = useState<
    string | null
  >(null);

  const sceneFactMutation = useMutation({
    mutationFn: ({ sceneId, text }: { sceneId: string; text: string }) =>
      createSceneFact(viewModel.project.id, sceneId, text),
    onSuccess: (payload, variables) => {
      if (payload?.fact) {
        tourScenes.updateItem(variables.sceneId, (scene) => ({
          ...scene,
          facts: [...scene.facts, payload.fact],
          hasProofedContext:
            scene.hasProofedContext || payload.fact.proofStatus === "proofed",
        }));
      }
      invalidateWorkspace();
    },
  });
  const updateSceneFactMutation = useMutation({
    mutationFn: ({
      sceneId,
      factId,
      text,
    }: {
      sceneId: string;
      factId: string;
      text: string;
    }) => updateSceneFact(viewModel.project.id, sceneId, factId, text),
    onSuccess: (payload, variables) => {
      if (payload?.fact) {
        tourScenes.updateItem(variables.sceneId, (scene) => ({
          ...scene,
          facts: scene.facts.map((fact) =>
            fact.id === variables.factId ? payload.fact : fact,
          ),
          hasProofedContext: scene.facts.some((fact) =>
            fact.id === variables.factId
              ? payload.fact.proofStatus === "proofed"
              : fact.proofStatus === "proofed",
          ),
        }));
      }
      invalidateWorkspace();
    },
  });
  const deleteSceneFactMutation = useMutation({
    mutationFn: ({ sceneId, factId }: { sceneId: string; factId: string }) =>
      deleteSceneFact(viewModel.project.id, sceneId, factId),
    onSuccess: (_payload, variables) => {
      tourScenes.updateItem(variables.sceneId, (scene) => {
        const facts = scene.facts.filter(
          (fact) => fact.id !== variables.factId,
        );
        return {
          ...scene,
          facts,
          hasProofedContext: facts.some(
            (fact) => fact.proofStatus === "proofed",
          ),
        };
      });
      invalidateWorkspace();
    },
  });

  const sceneMutations = useTourSceneMutations({
    projectId: viewModel.project.id,
    scenes: viewModel.tourScenes,
    onSceneCreated: (sceneId) => {
      setSceneTitle("");
      setScenePhoto(null);
      setIsAddSceneOpen(false);
      if (sceneId) {
        setPendingActiveSceneId(sceneId);
        activateScene(sceneId);
      }
    },
    onScenePhotoReplaced: () => {
      setReplacementPhoto(null);
      setSceneToReplacePhoto(null);
    },
    onAddPhotoSettled: () => {
      sourcePhotoSelection.clearPendingScenePhoto();
    },
  });
  const { tourScenes } = sceneMutations;
  const sourcePhotoSelection = useSourcePhotoSelection({
    scenes: tourScenes.items,
    activeSceneId,
  });
  const { activeScene, selectedSourcePhoto, pendingPhotoForActiveScene } =
    sourcePhotoSelection;
  const replacingScene = sceneToReplacePhoto
    ? (tourScenes.items.find((scene) => scene.id === sceneToReplacePhoto.id) ??
      sceneToReplacePhoto)
    : null;

  const activateScene = useCallback((sceneId: string | null) => {
    if (sceneId) {
      setIsReturningToProjectGrid(false);
    }
    setActiveSceneId(sceneId);
    onActiveSceneIdChange?.(sceneId);
  }, [onActiveSceneIdChange]);

  useEffect(() => {
    if (isReturningToProjectGrid) {
      return;
    }

    if (tourScenes.items.length === 0) {
      if (!pendingActiveSceneId) {
        activateScene(null);
      }
      return;
    }

    if (pendingActiveSceneId) {
      if (tourScenes.items.some((scene) => scene.id === pendingActiveSceneId)) {
        activateScene(pendingActiveSceneId);
        setPendingActiveSceneId(null);
      }
      return;
    }

    if (
      !activeSceneId ||
      !tourScenes.items.some((scene) => scene.id === activeSceneId)
    ) {
      activateScene(tourScenes.items[0].id);
    }
  }, [
    activateScene,
    activeSceneId,
    isReturningToProjectGrid,
    pendingActiveSceneId,
    tourScenes.items,
  ]);

  useEffect(() => {
    if (!scenePhoto) {
      setScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(scenePhoto);
    setScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [scenePhoto]);

  useEffect(() => {
    if (!replacementPhoto) {
      setReplacementPhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(replacementPhoto);
    setReplacementPhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [replacementPhoto]);

  function handleCreateScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("title", sceneTitle);
    if (scenePhoto) {
      formData.set("photo", scenePhoto);
    }
    sceneMutations.mutations.createScene.mutate(formData);
  }

  function handleReplaceScenePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sceneToReplacePhoto) {
      return;
    }

    const formData = new FormData();
    if (replacementPhoto) {
      formData.set("photo", replacementPhoto);
    }
    sceneMutations.mutations.replacePhoto.mutate({
      sceneId: sceneToReplacePhoto.id,
      formData,
    });
  }

  function handleAddScenePhoto(sceneId: string, file: File) {
    const formData = new FormData();
    formData.set("photo", file);
    sourcePhotoSelection.setPendingScenePhoto({ sceneId, file });
    sceneMutations.mutations.addPhoto.mutate({ sceneId, formData });
  }

  function confirmSceneDelete() {
    if (!sceneToDelete) {
      return;
    }

    const deletedSceneId = sceneToDelete.id;

    sceneMutations
      .deleteScene(deletedSceneId)
      .then(() => {
        tourScenes.setItems(
          tourScenes.items.filter((scene) => scene.id !== deletedSceneId),
        );
        setIsReturningToProjectGrid(true);
        activateScene(null);
        setSceneToDelete(null);
      })
      .catch(() => undefined);
  }

  return {
    activeSceneId,
    setActiveSceneId: activateScene,
    isAddSceneOpen,
    setIsAddSceneOpen,
    sceneToDelete,
    setSceneToDelete,
    sceneToReplacePhoto,
    setSceneToReplacePhoto,
    sceneTitle,
    setSceneTitle,
    scenePhoto,
    setScenePhoto,
    scenePhotoPreviewUrl,
    replacementPhoto,
    setReplacementPhoto,
    replacementPhotoPreviewUrl,
    tourScenes,
    sourcePhotoSelection,
    activeScene,
    selectedSourcePhoto,
    pendingPhotoForActiveScene,
    sceneCount: tourScenes.items.length,
    replacingScene,
    sceneFactMutation,
    updateSceneFactMutation,
    deleteSceneFactMutation,
    sceneMutations,
    createSceneMutation: sceneMutations.mutations.createScene,
    replacePhotoMutation: sceneMutations.mutations.replacePhoto,
    addPhotoMutation: sceneMutations.mutations.addPhoto,
    removePhotoMutation: sceneMutations.mutations.removePhoto,
    reorderScenesMutation: sceneMutations.mutations.reorderScenes,
    toggleSceneInclusionMutation: sceneMutations.mutations.toggleSceneInclusion,
    updateSceneCameraMotionMutation: sceneMutations.mutations.updateSceneCameraMotion,
    deleteSceneMutation: sceneMutations.mutations.deleteScene,
    updateCameraMotion: sceneMutations.updateCameraMotion,
    handleCreateScene,
    handleReplaceScenePhoto,
    handleAddScenePhoto,
    confirmSceneDelete,
  };
}
