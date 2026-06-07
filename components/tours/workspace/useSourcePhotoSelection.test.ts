import { test } from "vitest";
import assert from "node:assert/strict";

import type { TourScene } from "@/lib/tours/workspace";
import { resolveSourcePhotoSelection, type PendingScenePhoto } from "./useSourcePhotoSelection";

type SourcePhoto = TourScene["sourcePhotos"][number];

function photo(id: string, fileName = `${id}.jpg`): SourcePhoto {
  return {
    id,
    fileName,
    storagePath: `projects/project-1/${fileName}`,
    contentType: "image/jpeg",
    previewUrl: `https://example.test/${fileName}`,
  };
}

function scene(sourcePhotos: SourcePhoto[]): TourScene {
  const authoritativePhoto = sourcePhotos[0] ?? photo("authoritative");
  return {
    id: "scene-1",
    title: "Kitchen",
    sortOrder: 0,
    included: true,
    cameraMotion: "push_in",
    authoritativePhoto,
    sourcePhotos,
    status: "ready",
  };
}

function pendingPhoto(sceneId = "scene-1", fileName = "pending.jpg"): PendingScenePhoto {
  return {
    sceneId,
    file: new File(["pending"], fileName, { type: "image/jpeg" }),
  };
}

test("returns no selected photo for an empty active scene", () => {
  const selection = resolveSourcePhotoSelection({
    activeScene: null,
    selectedSourcePhotoId: null,
    pendingScenePhoto: null,
    pendingScenePhotoPreviewUrl: null,
  });

  assert.deepEqual(selection.activeScenePhotos, []);
  assert.equal(selection.selectedSourcePhoto, null);
  assert.equal(selection.pendingPhotoForActiveScene, null);
});

test("falls back to the authoritative photo for a one-photo scene", () => {
  const authoritativePhoto = photo("photo-1");
  const selection = resolveSourcePhotoSelection({
    activeScene: scene([authoritativePhoto]),
    selectedSourcePhotoId: null,
    pendingScenePhoto: null,
    pendingScenePhotoPreviewUrl: null,
  });

  assert.equal(selection.selectedSourcePhoto?.id, "photo-1");
});

test("selects a supplemental display photo without changing the authoritative fallback", () => {
  const selection = resolveSourcePhotoSelection({
    activeScene: scene([photo("authoritative"), photo("supplemental")]),
    selectedSourcePhotoId: "supplemental",
    pendingScenePhoto: null,
    pendingScenePhotoPreviewUrl: null,
  });

  assert.equal(selection.selectedSourcePhoto?.id, "supplemental");
});

test("derives pending upload preview and filename only for the active scene", () => {
  const pending = pendingPhoto("scene-1", "new-angle.jpg");
  const selection = resolveSourcePhotoSelection({
    activeScene: scene([photo("photo-1")]),
    selectedSourcePhotoId: null,
    pendingScenePhoto: pending,
    pendingScenePhotoPreviewUrl: "blob:preview",
  });
  const inactiveSelection = resolveSourcePhotoSelection({
    activeScene: scene([photo("photo-1")]),
    selectedSourcePhotoId: null,
    pendingScenePhoto: pendingPhoto("other-scene", "other.jpg"),
    pendingScenePhotoPreviewUrl: "blob:other",
  });

  assert.deepEqual(selection.pendingPhotoForActiveScene, {
    previewUrl: "blob:preview",
    fileName: "new-angle.jpg",
  });
  assert.equal(inactiveSelection.pendingPhotoForActiveScene, null);
});
