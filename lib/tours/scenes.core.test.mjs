import { test } from "vitest";
import assert from "node:assert/strict";

import {
  TOUR_SCENE_CAMERA_MOTIONS,
  createTourSceneFromAuthoritativePhoto,
  getAuthoritativeSourcePhoto,
  getInitialTourSceneCameraMotion,
  listTourScenesForProject,
  mapTourScene,
  getTourSceneReadinessStatus,
  reorderTourScenesForProject,
  toggleTourSceneInclusionForProject,
  validateTourSceneReorderProjectAccess,
} from "./scenes.core.ts";

const now = "2026-06-06T00:00:00.000Z";

function sceneRow(overrides = {}) {
  return {
    id: "scene-1",
    project_id: "project-1",
    title: "Kitchen",
    sort_order: 0,
    included: true,
    camera_motion: "slow_push",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function photoRow(overrides = {}) {
  return {
    id: "photo-1",
    project_id: "project-1",
    scene_id: "scene-1",
    storage_path: "tour-projects/project-1/kitchen.jpg",
    file_name: "kitchen.jpg",
    content_type: "image/jpeg",
    byte_size: 12345,
    width: 1600,
    height: 900,
    priority: 0,
    created_at: now,
    ...overrides,
  };
}

test("creates an included TourScene with ordering, safe camera motion, and authoritative photo", async () => {
  let createInput;
  const result = await createTourSceneFromAuthoritativePhoto(
    {
      projectId: "project-1",
      title: " Kitchen ",
      sourcePhoto: {
        storagePath: "tour-projects/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 12345,
        width: 1600,
        height: 900,
      },
    },
    {
      getNextSceneSortOrder: async () => 2,
      listSceneRowsByIds: async () => [],
      persistSceneOrder: async () => false,
      createSceneWithSourcePhoto: async (input) => {
        createInput = input;
        return {
          scene: sceneRow({
            title: input.title,
            sort_order: input.sortOrder,
            included: input.included,
            camera_motion: input.cameraMotion,
          }),
          sourcePhotos: [photoRow({
            storage_path: input.authoritativePhoto.storagePath,
            file_name: input.authoritativePhoto.fileName,
            content_type: input.authoritativePhoto.contentType,
            byte_size: input.authoritativePhoto.byteSize,
            priority: input.authoritativePhoto.priority,
          })],
        };
      },
      listSceneRowsWithSourcePhotos: async () => [],
      listSceneRowsForProject: async () => [],
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(createInput, {
    projectId: "project-1",
    title: "Kitchen",
    sortOrder: 2,
    included: true,
    cameraMotion: getInitialTourSceneCameraMotion(2),
    authoritativePhoto: {
      storagePath: "tour-projects/project-1/kitchen.jpg",
      fileName: "kitchen.jpg",
      contentType: "image/jpeg",
      byteSize: 12345,
      width: 1600,
      height: 900,
      priority: 0,
    },
  });
  assert.equal(result.scene.included, true);
  assert.equal(result.scene.sortOrder, 2);
  assert.ok(TOUR_SCENE_CAMERA_MOTIONS.includes(result.scene.cameraMotion));
  assert.equal(result.scene.authoritativePhoto.storagePath, "tour-projects/project-1/kitchen.jpg");
});

test("represents the highest-priority source photo as authoritative", () => {
  const authoritativePhoto = getAuthoritativeSourcePhoto([
    photoRow({ id: "photo-later", priority: 5, storage_path: "later.jpg" }),
    photoRow({ id: "photo-first", priority: 0, storage_path: "first.jpg" }),
  ]);

  assert.equal(authoritativePhoto.id, "photo-first");
  assert.equal(authoritativePhoto.storagePath, "first.jpg");
});

test("included TourScenes require an authoritative listing photo", () => {
  const mapped = mapTourScene(sceneRow({ included: true }), []);

  assert.equal(mapped, null);
});

test("lists TourScenes in saved order", async () => {
  const scenes = await listTourScenesForProject("project-1", {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async () => [],
    persistSceneOrder: async () => false,
    listSceneRowsWithSourcePhotos: async () => [
      { scene: sceneRow({ id: "scene-2", sort_order: 2, title: "Bedroom" }), sourcePhotos: [photoRow({ scene_id: "scene-2" })] },
      { scene: sceneRow({ id: "scene-1", sort_order: 1, title: "Kitchen" }), sourcePhotos: [photoRow({ scene_id: "scene-1" })] },
    ],
    listSceneRowsForProject: async () => [],
  });

  assert.deepEqual(scenes.map((scene) => scene.title), ["Kitchen", "Bedroom"]);
});

test("persists a valid TourScene reorder and returns stable workspace order", async () => {
  let persistedOrder;
  const result = await reorderTourScenesForProject("project-1", ["scene-2", "scene-1"], {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async (ids) => ids.map((id) => sceneRow({ id, project_id: "project-1" })),
    listSceneRowsForProject: async () => [
      sceneRow({ id: "scene-1", project_id: "project-1" }),
      sceneRow({ id: "scene-2", project_id: "project-1" }),
    ],
    persistSceneOrder: async (_projectId, ids) => {
      persistedOrder = ids;
      return true;
    },
    listSceneRowsWithSourcePhotos: async () => [
      { scene: sceneRow({ id: "scene-1", sort_order: 1, title: "Kitchen" }), sourcePhotos: [photoRow({ scene_id: "scene-1" })] },
      { scene: sceneRow({ id: "scene-2", sort_order: 0, title: "Bedroom" }), sourcePhotos: [photoRow({ scene_id: "scene-2" })] },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(persistedOrder, ["scene-2", "scene-1"]);
  assert.deepEqual(result.scenes.map((scene) => scene.title), ["Bedroom", "Kitchen"]);
});

test("rejects cross-project scene IDs before persisting order", async () => {
  let persisted = false;
  const result = await reorderTourScenesForProject("project-1", ["scene-1", "scene-2"], {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async () => [
      sceneRow({ id: "scene-1", project_id: "project-1" }),
      sceneRow({ id: "scene-2", project_id: "project-2" }),
    ],
    listSceneRowsForProject: async () => [
      sceneRow({ id: "scene-1", project_id: "project-1" }),
    ],
    persistSceneOrder: async () => {
      persisted = true;
      return true;
    },
    listSceneRowsWithSourcePhotos: async () => [],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "TourScenes can only be reordered within the same Tour Project.",
  });
  assert.equal(persisted, false);
});

test("rejects missing scenes before persisting order", async () => {
  let persisted = false;
  const result = await reorderTourScenesForProject("project-1", ["scene-1", "missing"], {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async () => [sceneRow({ id: "scene-1", project_id: "project-1" })],
    listSceneRowsForProject: async () => [sceneRow({ id: "scene-1", project_id: "project-1" })],
    persistSceneOrder: async () => {
      persisted = true;
      return true;
    },
    listSceneRowsWithSourcePhotos: async () => [],
  });

  assert.deepEqual(result, { ok: false, error: "TourScene order includes missing scenes." });
  assert.equal(persisted, false);
});

test("rejects incomplete TourScene orders before persisting", async () => {
  let persisted = false;
  const result = await reorderTourScenesForProject("project-1", ["scene-2", "scene-1"], {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async (ids) => ids.map((id) => sceneRow({ id, project_id: "project-1" })),
    listSceneRowsForProject: async () => [
      sceneRow({ id: "scene-1", project_id: "project-1" }),
      sceneRow({ id: "scene-2", project_id: "project-1" }),
      sceneRow({ id: "scene-3", project_id: "project-1" }),
    ],
    persistSceneOrder: async () => {
      persisted = true;
      return true;
    },
    listSceneRowsWithSourcePhotos: async () => [],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "TourScene order must include every scene in this Tour Project.",
  });
  assert.equal(persisted, false);
});

test("rejects archived projects for TourScene reorder", () => {
  assert.deepEqual(validateTourSceneReorderProjectAccess({ status: "archived" }), {
    ok: false,
    status: 409,
    error: "Archived Tour Projects cannot reorder TourScenes.",
  });
});

test("toggles TourScene inclusion without deleting source media", async () => {
  let updatedInput;
  const result = await toggleTourSceneInclusionForProject("project-1", "scene-1", false, {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async () => [sceneRow({ id: "scene-1", project_id: "project-1", included: true })],
    listSceneRowsForProject: async () => [],
    persistSceneOrder: async () => false,
    updateSceneInclusion: async (projectId, sceneId, included) => {
      updatedInput = { projectId, sceneId, included };
      return {
        scene: sceneRow({ id: sceneId, project_id: projectId, included }),
        sourcePhotos: [photoRow({ scene_id: sceneId })],
      };
    },
    listSceneRowsWithSourcePhotos: async () => [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(updatedInput, { projectId: "project-1", sceneId: "scene-1", included: false });
  assert.equal(result.scene.included, false);
  assert.equal(result.scene.authoritativePhoto.fileName, "kitchen.jpg");
});

test("rejects cross-project TourScene inclusion updates", async () => {
  let updated = false;
  const result = await toggleTourSceneInclusionForProject("project-1", "scene-2", true, {
    getNextSceneSortOrder: async () => 0,
    createSceneWithSourcePhoto: async () => null,
    listSceneRowsByIds: async () => [sceneRow({ id: "scene-2", project_id: "project-2" })],
    listSceneRowsForProject: async () => [],
    persistSceneOrder: async () => false,
    updateSceneInclusion: async () => {
      updated = true;
      return null;
    },
    listSceneRowsWithSourcePhotos: async () => [],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "TourScenes can only be updated within the same Tour Project.",
  });
  assert.equal(updated, false);
});

test("rolls workspace readiness up as skipped when every TourScene is excluded", () => {
  assert.equal(getTourSceneReadinessStatus([]), "not_started");
  assert.equal(getTourSceneReadinessStatus([{ included: false }]), "skipped");
  assert.equal(getTourSceneReadinessStatus([{ included: false }, { included: true }]), "ready");
});
