"use client";

import { useEffect, useMemo, useState } from "react";
import type { TourScene } from "@/lib/tours/workspace";

export type PendingScenePhoto = {
  sceneId: string;
  file: File;
};

export type SourcePhotoSelection = {
  activeScene: TourScene | null;
  activeScenePhotos: TourScene["sourcePhotos"];
  selectedSourcePhoto: TourScene["sourcePhotos"][number] | null;
  selectedSourcePhotoId: string | null;
  pendingPhotoForActiveScene: {
    previewUrl: string;
    fileName: string;
  } | null;
  setSelectedSourcePhotoId: (photoId: string | null) => void;
  setPendingScenePhoto: (photo: PendingScenePhoto | null) => void;
  clearPendingScenePhoto: () => void;
};

export function resolveSourcePhotoSelection({
  activeScene,
  selectedSourcePhotoId,
  pendingScenePhoto,
  pendingScenePhotoPreviewUrl,
}: {
  activeScene: TourScene | null;
  selectedSourcePhotoId: string | null;
  pendingScenePhoto: PendingScenePhoto | null;
  pendingScenePhotoPreviewUrl: string | null;
}) {
  const activeScenePhotos = activeScene
    ? activeScene.sourcePhotos.length > 0
      ? activeScene.sourcePhotos
      : [activeScene.authoritativePhoto]
    : [];
  const selectedSourcePhoto =
    activeScenePhotos.find((photo) => photo.id === selectedSourcePhotoId) ??
    activeScene?.authoritativePhoto ??
    activeScenePhotos[0] ??
    null;
  const pendingPhotoForActiveScene =
    activeScene && pendingScenePhoto?.sceneId === activeScene.id && pendingScenePhotoPreviewUrl
      ? {
          previewUrl: pendingScenePhotoPreviewUrl,
          fileName: pendingScenePhoto.file.name,
        }
      : null;

  return {
    activeScenePhotos,
    selectedSourcePhoto,
    pendingPhotoForActiveScene,
  };
}

export function useSourcePhotoSelection({
  scenes,
  activeSceneId,
}: {
  scenes: TourScene[];
  activeSceneId: string | null;
}): SourcePhotoSelection {
  const [selectedSourcePhotoId, setSelectedSourcePhotoId] = useState<string | null>(null);
  const [pendingScenePhoto, setPendingScenePhoto] = useState<PendingScenePhoto | null>(null);
  const [pendingScenePhotoPreviewUrl, setPendingScenePhotoPreviewUrl] = useState<string | null>(null);
  const activeScene = useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId) ?? null,
    [activeSceneId, scenes]
  );
  const selection = resolveSourcePhotoSelection({
    activeScene,
    selectedSourcePhotoId,
    pendingScenePhoto,
    pendingScenePhotoPreviewUrl,
  });

  useEffect(() => {
    if (!activeScene) {
      setSelectedSourcePhotoId(null);
      return;
    }

    const selectedPhotoStillExists = selection.activeScenePhotos.some(
      (photo) => photo.id === selectedSourcePhotoId
    );
    if (!selectedPhotoStillExists) {
      setSelectedSourcePhotoId(activeScene.authoritativePhoto.id);
    }
  }, [activeScene, selectedSourcePhotoId, selection.activeScenePhotos]);

  useEffect(() => {
    if (!pendingScenePhoto) {
      setPendingScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(pendingScenePhoto.file);
    setPendingScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [pendingScenePhoto]);

  return {
    activeScene,
    activeScenePhotos: selection.activeScenePhotos,
    selectedSourcePhoto: selection.selectedSourcePhoto,
    selectedSourcePhotoId,
    pendingPhotoForActiveScene: selection.pendingPhotoForActiveScene,
    setSelectedSourcePhotoId,
    setPendingScenePhoto,
    clearPendingScenePhoto: () => setPendingScenePhoto(null),
  };
}
