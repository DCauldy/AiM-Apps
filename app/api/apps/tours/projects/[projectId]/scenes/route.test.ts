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
  getListingMediaStoragePath: vi.fn(),
  validateListingMediaFile: vi.fn(),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/listing-media-authorization", () => ({
  getListingMediaAcknowledgementForProject: mocks.getListingMediaAcknowledgementForProject,
}));

vi.mock("@/lib/tours/listing-media-upload", () => ({
  LISTING_MEDIA_BUCKET: "tours-listing-media",
  getListingMediaStoragePath: mocks.getListingMediaStoragePath,
  validateListingMediaFile: mocks.validateListingMediaFile,
}));

vi.mock("@/lib/tours/scenes", () => ({
  createTourSceneFromAuthoritativePhoto: mocks.createTourSceneFromAuthoritativePhoto,
  reorderTourScenes: mocks.reorderTourScenes,
  toggleTourSceneInclusion: mocks.toggleTourSceneInclusion,
}));

import { POST as createScene } from "./route";
import { PATCH as reorderScenes } from "./reorder/route";
import { PATCH as toggleSceneInclusion } from "./[sceneId]/inclusion/route";
import { DELETE as deleteAuthoritativePhoto } from "./[sceneId]/photo/route";

const params = { params: Promise.resolve({ projectId: "project-1" }) };
const sceneParams = { params: Promise.resolve({ projectId: "project-1", sceneId: "scene-1" }) };

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
  };
  const supabase = {
    storage: {
      from: vi.fn(() => bucket),
    },
  };
  return { bucket, supabase };
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
    scene: { id: "scene-1", title: "Kitchen" },
  });

  const response = await createScene(formRequest(), params);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({
    scene: { id: "scene-1", title: "Kitchen" },
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
