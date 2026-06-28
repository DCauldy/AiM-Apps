import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getListingMediaAcknowledgementForProject: vi.fn(),
  createTourSceneFromAuthoritativePhoto: vi.fn(),
  reorderTourScenes: vi.fn(),
  toggleTourSceneInclusion: vi.fn(),
  updateTourSceneCameraMotion: vi.fn(),
  updateSceneTransitionEffect: vi.fn(),
  deleteTourScene: vi.fn(),
  listTourSceneFactsForScene: vi.fn(),
  createHumanTourSceneFact: vi.fn(),
  updateHumanTourSceneFact: vi.fn(),
  deleteTourSceneFact: vi.fn(),
  getListingMediaStoragePath: vi.fn(),
  validateListingMediaFile: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/listing-media/listing-media-authorization", () => ({
  getListingMediaAcknowledgementForProject: mocks.getListingMediaAcknowledgementForProject,
}));

vi.mock("@/lib/tours/listing-media/listing-media-upload", () => ({
  LISTING_MEDIA_BUCKET: "tours-listing-media",
  getListingMediaStoragePath: mocks.getListingMediaStoragePath,
  validateListingMediaFile: mocks.validateListingMediaFile,
}));

vi.mock("@/lib/tours/scenes", () => ({
  createTourSceneFromAuthoritativePhoto: mocks.createTourSceneFromAuthoritativePhoto,
  reorderTourScenes: mocks.reorderTourScenes,
  toggleTourSceneInclusion: mocks.toggleTourSceneInclusion,
  updateTourSceneCameraMotion: mocks.updateTourSceneCameraMotion,
  updateSceneTransitionEffect: mocks.updateSceneTransitionEffect,
  deleteTourScene: mocks.deleteTourScene,
}));

vi.mock("@/lib/tours/facts/facts", () => ({
  listTourSceneFactsForScene: mocks.listTourSceneFactsForScene,
  createHumanTourSceneFact: mocks.createHumanTourSceneFact,
  updateHumanTourSceneFact: mocks.updateHumanTourSceneFact,
  deleteTourSceneFact: mocks.deleteTourSceneFact,
}));

import { POST as createScene } from "./route";
import { PATCH as reorderScenes } from "./reorder/route";
import { DELETE as deleteScene, PATCH as updateScene } from "./[sceneId]/route";
import { PATCH as toggleSceneInclusion } from "./[sceneId]/inclusion/route";
import {
  DELETE as deleteAuthoritativePhoto,
  PATCH as replaceAuthoritativePhoto,
  POST as addScenePhoto,
} from "./[sceneId]/photo/route";
import { GET as listSceneFacts, POST as createSceneFact } from "./[sceneId]/facts/route";
import {
  DELETE as deleteSceneFact,
  PATCH as updateSceneFact,
} from "./[sceneId]/facts/[factId]/route";

const params = { params: Promise.resolve({ projectId: "project-1" }) };
const sceneParams = { params: Promise.resolve({ projectId: "project-1", sceneId: "scene-1" }) };
const factParams = { params: Promise.resolve({ projectId: "project-1", sceneId: "scene-1", factId: "fact-1" }) };

function jsonRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function formRequest() {
  const formData = new FormData();
  formData.set("title", "Kitchen");
  formData.set("photo", new File(["image"], "kitchen.jpg", { type: "image/jpeg" }));
  return {
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request;
}

function createStorageClient() {
  const bucket = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example/kitchen.jpg" },
      error: null,
    }),
  };
  const supabase = {
    storage: {
      from: vi.fn(() => bucket),
    },
  };
  return { bucket, supabase };
}

function sceneModel(overrides = {}) {
  return {
    id: "scene-1",
    projectId: "project-1",
    title: "Kitchen",
    sortOrder: 0,
    included: true,
    cameraMotion: "auto",
    transitionEffect: "auto",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    authoritativePhoto: {
      id: "photo-1",
      projectId: "project-1",
      sceneId: "scene-1",
      storagePath: "user-1/project-1/kitchen.jpg",
      fileName: "kitchen.jpg",
      contentType: "image/jpeg",
      byteSize: 5,
      width: null,
      height: null,
      priority: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    sourcePhotos: [
      {
        id: "photo-1",
        projectId: "project-1",
        sceneId: "scene-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 5,
        width: null,
        height: null,
        priority: 0,
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function sceneRow(overrides = {}) {
  return {
    id: "scene-1",
    project_id: "project-1",
    title: "Kitchen",
    sort_order: 0,
    included: true,
    camera_motion: "auto",
    transition_effect: "auto",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function sourcePhotoRow(overrides = {}) {
  return {
    id: "photo-1",
    project_id: "project-1",
    scene_id: "scene-1",
    storage_path: "user-1/project-1/kitchen.jpg",
    file_name: "kitchen.jpg",
    content_type: "image/jpeg",
    byte_size: 5,
    width: null,
    height: null,
    priority: 0,
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function createPhotoRouteSupabase({
  scene,
  lastPhoto,
  createdPhoto,
  currentPhoto,
  updatedPhoto,
}: {
  scene?: unknown;
  lastPhoto?: unknown;
  createdPhoto?: unknown;
  currentPhoto?: unknown;
  updatedPhoto?: unknown;
}) {
  const { bucket, supabase } = createStorageClient();
  const sceneSelectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: scene ?? sceneRow(), error: null }),
  };
  const sceneUpdateQuery = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
  const lastPhotoQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: lastPhoto ?? { priority: 0 }, error: null }),
  };
  const createPhotoQuery = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: createdPhoto ?? sourcePhotoRow({ id: "photo-2", storage_path: "user-1/project-1/kitchen-secondary.jpg" }),
      error: null,
    }),
  };
  const currentPhotoQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: currentPhoto ?? sourcePhotoRow({ id: "photo-1", storage_path: "user-1/project-1/old-kitchen.jpg" }),
      error: null,
    }),
  };
  const updatePhotoQuery = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: updatedPhoto ?? sourcePhotoRow({ id: "photo-1", storage_path: "user-1/project-1/kitchen.jpg" }),
      error: null,
    }),
  };
  const sourcePhotoQueries =
    currentPhoto || updatedPhoto
      ? [currentPhotoQuery, updatePhotoQuery]
      : [lastPhotoQuery, createPhotoQuery];
  const tableQueries = new Map<string, unknown[]>([
    ["tour_scenes", [sceneSelectQuery, sceneUpdateQuery]],
    ["tour_scene_source_photos", sourcePhotoQueries],
  ]);

  return {
    bucket,
    supabase: {
      ...supabase,
      from: vi.fn((table: string) => tableQueries.get(table)?.shift()),
    },
    queries: {
      createPhotoQuery,
      updatePhotoQuery,
    },
  };
}

function allowAccess(supabase: unknown = createStorageClient().supabase) {
  mocks.requireToursAccess.mockResolvedValue({
    ok: true,
    status: 200,
    user: { id: "user-1" },
    project: { id: "project-1", status: "open" },
    supabase,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getListingMediaAcknowledgementForProject.mockResolvedValue({
    projectId: "project-1",
    acknowledgedAt: "2026-06-06T00:00:00.000Z",
  });
  mocks.getListingMediaStoragePath.mockReturnValue("user-1/project-1/kitchen.jpg");
  mocks.validateListingMediaFile.mockReturnValue({
    ok: true,
    file: {
      name: "kitchen.jpg",
      type: "image/jpeg",
      size: 5,
    },
  });
});

test("create TourScene returns access errors before checking listing-media acknowledgement", async () => {
  mocks.requireToursAccess.mockResolvedValue({
    ok: false,
    status: 401,
    error: "Sign in to use Tours.",
    supabase: null,
    user: null,
    project: null,
  });

  const response = await createScene(formRequest(), params);

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Sign in to use Tours." });
  expect(mocks.getListingMediaAcknowledgementForProject).not.toHaveBeenCalled();
});

test("create TourScene requires listing-media acknowledgement before upload", async () => {
  const { bucket, supabase } = createStorageClient();
  allowAccess(supabase);
  mocks.getListingMediaAcknowledgementForProject.mockResolvedValue(null);

  const response = await createScene(formRequest(), params);

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "Acknowledge listing-media authorization before submitting images for this Tour Project.",
  });
  expect(bucket.upload).not.toHaveBeenCalled();
  expect(mocks.createTourSceneFromAuthoritativePhoto).not.toHaveBeenCalled();
});

test("create TourScene uploads source photo and delegates scene creation", async () => {
  const { bucket, supabase } = createStorageClient();
  allowAccess(supabase);
  mocks.createTourSceneFromAuthoritativePhoto.mockResolvedValue({
    ok: true,
    scene: sceneModel(),
  });

  const response = await createScene(formRequest(), params);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({
    scene: {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 0,
      included: true,
      cameraMotion: "auto",
      transitionEffect: "auto",
      authoritativePhoto: {
        id: "photo-1",
        fileName: "kitchen.jpg",
        storagePath: "user-1/project-1/kitchen.jpg",
        contentType: "image/jpeg",
        previewUrl: "https://signed.example/kitchen.jpg",
      },
      sourcePhotos: [
        {
          id: "photo-1",
          fileName: "kitchen.jpg",
          storagePath: "user-1/project-1/kitchen.jpg",
          contentType: "image/jpeg",
          previewUrl: "https://signed.example/kitchen.jpg",
        },
      ],
      facts: [],
      hasProofedContext: false,
      status: "ready",
    },
  });
  expect(supabase.storage.from).toHaveBeenCalledWith("tours-listing-media");
  expect(bucket.upload).toHaveBeenCalledWith(
    "user-1/project-1/kitchen.jpg",
    { name: "kitchen.jpg", type: "image/jpeg", size: 5 },
    { contentType: "image/jpeg", upsert: false }
  );
  expect(mocks.createTourSceneFromAuthoritativePhoto).toHaveBeenCalledWith({
    projectId: "project-1",
    title: "Kitchen",
    sourcePhoto: {
      storagePath: "user-1/project-1/kitchen.jpg",
      fileName: "kitchen.jpg",
      contentType: "image/jpeg",
      byteSize: 5,
    },
  });
  expect(bucket.createSignedUrl).toHaveBeenCalledWith("user-1/project-1/kitchen.jpg", 60 * 60);
});

test("create TourScene removes uploaded source photo when scene creation fails", async () => {
  const { bucket, supabase } = createStorageClient();
  allowAccess(supabase);
  mocks.createTourSceneFromAuthoritativePhoto.mockResolvedValue({
    ok: false,
    error: "Could not create the TourScene.",
  });

  const response = await createScene(formRequest(), params);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Could not create the TourScene." });
  expect(bucket.remove).toHaveBeenCalledWith(["user-1/project-1/kitchen.jpg"]);
});

test("add scene photo returns a signed workspace source photo", async () => {
  const { bucket, supabase, queries } = createPhotoRouteSupabase({
    createdPhoto: sourcePhotoRow({
      id: "photo-2",
      storage_path: "user-1/project-1/kitchen-secondary.jpg",
      file_name: "kitchen-secondary.jpg",
      priority: 1,
    }),
  });
  allowAccess(supabase);
  mocks.getListingMediaStoragePath.mockReturnValue("user-1/project-1/kitchen-secondary.jpg");
  bucket.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/kitchen-secondary.jpg" },
    error: null,
  });

  const response = await addScenePhoto(formRequest(), sceneParams);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({
    scene: sceneRow(),
    sourcePhoto: {
      id: "photo-2",
      fileName: "kitchen-secondary.jpg",
      storagePath: "user-1/project-1/kitchen-secondary.jpg",
      contentType: "image/jpeg",
      previewUrl: "https://signed.example/kitchen-secondary.jpg",
    },
  });
  expect(queries.createPhotoQuery.insert).toHaveBeenCalledWith({
    project_id: "project-1",
    scene_id: "scene-1",
    storage_path: "user-1/project-1/kitchen-secondary.jpg",
    file_name: "kitchen.jpg",
    content_type: "image/jpeg",
    byte_size: 5,
    width: null,
    height: null,
    priority: 1,
  });
  expect(bucket.createSignedUrl).toHaveBeenCalledWith("user-1/project-1/kitchen-secondary.jpg", 60 * 60);
});

test("replace authoritative scene photo returns a signed workspace photo", async () => {
  const { bucket, supabase, queries } = createPhotoRouteSupabase({
    updatedPhoto: sourcePhotoRow({
      id: "photo-1",
      storage_path: "user-1/project-1/replacement.jpg",
      file_name: "replacement.jpg",
    }),
  });
  allowAccess(supabase);
  mocks.getListingMediaStoragePath.mockReturnValue("user-1/project-1/replacement.jpg");
  bucket.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/replacement.jpg" },
    error: null,
  });

  const response = await replaceAuthoritativePhoto(formRequest(), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    scene: sceneRow(),
    authoritativePhoto: {
      id: "photo-1",
      fileName: "replacement.jpg",
      storagePath: "user-1/project-1/replacement.jpg",
      contentType: "image/jpeg",
      previewUrl: "https://signed.example/replacement.jpg",
    },
  });
  expect(queries.updatePhotoQuery.update).toHaveBeenCalledWith({
    storage_path: "user-1/project-1/replacement.jpg",
    file_name: "kitchen.jpg",
    content_type: "image/jpeg",
    byte_size: 5,
    width: null,
    height: null,
  });
  expect(bucket.remove).toHaveBeenCalledWith(["user-1/project-1/old-kitchen.jpg"]);
  expect(bucket.createSignedUrl).toHaveBeenCalledWith("user-1/project-1/replacement.jpg", 60 * 60);
});

test("reorder TourScenes validates request body before service delegation", async () => {
  allowAccess();

  const response = await reorderScenes(jsonRequest({ orderedSceneIds: ["scene-1", ""] }), params);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Send a valid TourScene order." });
  expect(mocks.reorderTourScenes).not.toHaveBeenCalled();
});

test("reorder TourScenes delegates valid order to the scene service", async () => {
  allowAccess();
  mocks.reorderTourScenes.mockResolvedValue({
    ok: true,
    scenes: [{ id: "scene-2" }, { id: "scene-1" }],
  });

  const response = await reorderScenes(jsonRequest({ orderedSceneIds: ["scene-2", "scene-1"] }), params);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    scenes: [{ id: "scene-2" }, { id: "scene-1" }],
  });
  expect(mocks.reorderTourScenes).toHaveBeenCalledWith({
    projectId: "project-1",
    orderedSceneIds: ["scene-2", "scene-1"],
  });
});

test("toggle TourScene inclusion validates boolean payload before service delegation", async () => {
  allowAccess();

  const response = await toggleSceneInclusion(jsonRequest({ included: "false" }), sceneParams);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "Send whether this TourScene should be included.",
  });
  expect(mocks.toggleTourSceneInclusion).not.toHaveBeenCalled();
});

test("toggle TourScene inclusion delegates valid payload to the scene service", async () => {
  allowAccess();
  mocks.toggleTourSceneInclusion.mockResolvedValue({
    ok: true,
    scene: { id: "scene-1", included: false },
  });

  const response = await toggleSceneInclusion(jsonRequest({ included: false }), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    scene: { id: "scene-1", included: false },
  });
  expect(mocks.toggleTourSceneInclusion).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    included: false,
  });
});

test("update TourScene camera motion validates known motion before service delegation", async () => {
  allowAccess();

  const response = await updateScene(jsonRequest({ cameraMotion: "orbit_whip" }), sceneParams);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Choose a valid camera motion." });
  expect(mocks.updateTourSceneCameraMotion).not.toHaveBeenCalled();
});

test("update TourScene camera motion delegates valid payload to the scene service", async () => {
  allowAccess();
  mocks.updateTourSceneCameraMotion.mockResolvedValue({
    ok: true,
    scene: { id: "scene-1", cameraMotion: "hero_reveal" },
  });

  const response = await updateScene(jsonRequest({ cameraMotion: "hero_reveal" }), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    scene: { id: "scene-1", cameraMotion: "hero_reveal" },
  });
  expect(mocks.updateTourSceneCameraMotion).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    cameraMotion: "hero_reveal",
  });
});

test("update TourScene transition validates known effects before service delegation", async () => {
  allowAccess();

  const response = await updateScene(jsonRequest({ transitionEffect: "sparkle-cut" }), sceneParams);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Choose a valid scene transition." });
  expect(mocks.updateSceneTransitionEffect).not.toHaveBeenCalled();
});

test("update TourScene transition delegates auto payload to the scene service", async () => {
  allowAccess();
  mocks.updateSceneTransitionEffect.mockResolvedValue({
    ok: true,
    scene: { id: "scene-1", transitionEffect: "auto" },
  });

  const response = await updateScene(jsonRequest({ transitionEffect: "auto" }), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    scene: { id: "scene-1", transitionEffect: "auto" },
  });
  expect(mocks.updateSceneTransitionEffect).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    transitionEffect: "auto",
  });
});

test("delete authoritative source photo calls the RPC contract and removes storage object", async () => {
  const { bucket, supabase } = createStorageClient();
  const rpcSingle = vi.fn().mockResolvedValue({
    data: {
      removed_photo_id: "photo-1",
      removed_storage_path: "user-1/project-1/kitchen.jpg",
    },
    error: null,
  });
  const rpc = vi.fn(() => ({ single: rpcSingle }));
  allowAccess({ ...supabase, rpc });

  const response = await deleteAuthoritativePhoto(new Request("http://test.local", { method: "DELETE" }), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ removedPhotoId: "photo-1" });
  expect(rpc).toHaveBeenCalledWith("delete_tour_scene_source_photo", {
    p_project_id: "project-1",
    p_scene_id: "scene-1",
    p_source_photo_id: null,
  });
  expect(bucket.remove).toHaveBeenCalledWith(["user-1/project-1/kitchen.jpg"]);
});

test("delete selected secondary source photo passes the source photo id to the RPC", async () => {
  const { bucket, supabase } = createStorageClient();
  const rpcSingle = vi.fn().mockResolvedValue({
    data: {
      removed_photo_id: "photo-secondary",
      removed_storage_path: "user-1/project-1/kitchen-secondary.jpg",
    },
    error: null,
  });
  const rpc = vi.fn(() => ({ single: rpcSingle }));
  allowAccess({ ...supabase, rpc });

  const response = await deleteAuthoritativePhoto(
    new Request("http://test.local?sourcePhotoId=photo-secondary", { method: "DELETE" }),
    sceneParams
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ removedPhotoId: "photo-secondary" });
  expect(rpc).toHaveBeenCalledWith("delete_tour_scene_source_photo", {
    p_project_id: "project-1",
    p_scene_id: "scene-1",
    p_source_photo_id: "photo-secondary",
  });
  expect(bucket.remove).toHaveBeenCalledWith(["user-1/project-1/kitchen-secondary.jpg"]);
});

test("delete TourScene removes the scene and storage objects", async () => {
  const { bucket, supabase } = createStorageClient();
  allowAccess(supabase);
  mocks.deleteTourScene.mockResolvedValue({
    ok: true,
    storagePaths: ["user-1/project-1/kitchen.jpg", "user-1/project-1/kitchen-alt.jpg"],
  });

  const response = await deleteScene(new Request("http://test.local", { method: "DELETE" }), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ removedSceneId: "scene-1" });
  expect(mocks.deleteTourScene).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
  });
  expect(supabase.storage.from).toHaveBeenCalledWith("tours-listing-media");
  expect(bucket.remove).toHaveBeenCalledWith([
    "user-1/project-1/kitchen.jpg",
    "user-1/project-1/kitchen-alt.jpg",
  ]);
});

test("delete TourScene returns service errors before storage cleanup", async () => {
  const { bucket, supabase } = createStorageClient();
  allowAccess(supabase);
  mocks.deleteTourScene.mockResolvedValue({
    ok: false,
    error: "TourScene was not found.",
  });

  const response = await deleteScene(new Request("http://test.local", { method: "DELETE" }), sceneParams);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "TourScene was not found." });
  expect(bucket.remove).not.toHaveBeenCalled();
});

test("list scene facts returns access errors before service delegation", async () => {
  mocks.requireToursAccess.mockResolvedValue({
    ok: false,
    status: 403,
    error: "Tours is not available for this account.",
    supabase: null,
    user: null,
    project: null,
  });

  const response = await listSceneFacts(new Request("http://test.local"), sceneParams);

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "Tours is not available for this account." });
  expect(mocks.listTourSceneFactsForScene).not.toHaveBeenCalled();
});

test("list scene facts delegates to the facts service", async () => {
  allowAccess();
  mocks.listTourSceneFactsForScene.mockResolvedValue([{ id: "fact-1", text: "Quartz counters" }]);

  const response = await listSceneFacts(new Request("http://test.local"), sceneParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ facts: [{ id: "fact-1", text: "Quartz counters" }] });
  expect(mocks.listTourSceneFactsForScene).toHaveBeenCalledWith({ projectId: "project-1", sceneId: "scene-1" });
});

test("create scene fact validates text before returning a user-actionable service error", async () => {
  allowAccess();
  mocks.createHumanTourSceneFact.mockResolvedValue({ ok: false, error: "Enter a scene fact." });

  const response = await createSceneFact(jsonRequest({ text: "   " }), sceneParams);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Enter a scene fact." });
  expect(mocks.createHumanTourSceneFact).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    text: "   ",
    proofedBy: "user-1",
  });
});

test("create scene fact returns the created proofed human fact", async () => {
  allowAccess();
  mocks.createHumanTourSceneFact.mockResolvedValue({
    ok: true,
    fact: { id: "fact-1", text: "Quartz counters", sourceType: "human", proofStatus: "proofed" },
  });

  const response = await createSceneFact(jsonRequest({ text: "Quartz counters" }), sceneParams);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({
    fact: { id: "fact-1", text: "Quartz counters", sourceType: "human", proofStatus: "proofed" },
  });
  expect(mocks.createHumanTourSceneFact).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    text: "Quartz counters",
    proofedBy: "user-1",
  });
});

test("update scene fact delegates scoped updates to the facts service", async () => {
  allowAccess();
  mocks.updateHumanTourSceneFact.mockResolvedValue({
    ok: true,
    fact: { id: "fact-1", text: "Quartz island", sourceType: "human", proofStatus: "proofed" },
  });

  const response = await updateSceneFact(jsonRequest({ text: "Quartz island" }), factParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    fact: { id: "fact-1", text: "Quartz island", sourceType: "human", proofStatus: "proofed" },
  });
  expect(mocks.updateHumanTourSceneFact).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    factId: "fact-1",
    text: "Quartz island",
    proofedBy: "user-1",
  });
});

test("delete scene fact delegates scoped deletes to the facts service", async () => {
  allowAccess();
  mocks.deleteTourSceneFact.mockResolvedValue({ ok: true, factId: "fact-1" });

  const response = await deleteSceneFact(new Request("http://test.local", { method: "DELETE" }), factParams);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ factId: "fact-1" });
  expect(mocks.deleteTourSceneFact).toHaveBeenCalledWith({
    projectId: "project-1",
    sceneId: "scene-1",
    factId: "fact-1",
  });
});
