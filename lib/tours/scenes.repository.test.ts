import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createTourSceneFromAuthoritativePhoto, reorderTourScenes } from "./scenes";

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

function sourcePhotoRow(overrides = {}) {
  return {
    id: "photo-1",
    project_id: "project-1",
    scene_id: "scene-1",
    storage_path: "user-1/project-1/kitchen.jpg",
    file_name: "kitchen.jpg",
    content_type: "image/jpeg",
    byte_size: 123,
    width: null,
    height: null,
    priority: 0,
    created_at: now,
    ...overrides,
  };
}

function createNextSortOrderBuilder(sortOrder: number) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { sort_order: sortOrder }, error: null });
  return chain;
}

function createListByIdsBuilder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

function createOrderedScenesBuilder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

function createOrderedSourcePhotosBuilder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("create TourScene adapter calls the atomic create RPC with authoritative source-photo args", async () => {
  const rpcSingle = vi.fn().mockResolvedValue({
    data: {
      scene_id: "scene-1",
      scene_project_id: "project-1",
      scene_title: "Kitchen",
      scene_sort_order: 3,
      scene_included: true,
      scene_camera_motion: "slow_push",
      scene_created_at: now,
      scene_updated_at: now,
      source_photo_id: "photo-1",
      source_photo_project_id: "project-1",
      source_photo_scene_id: "scene-1",
      source_photo_storage_path: "user-1/project-1/kitchen.jpg",
      source_photo_file_name: "kitchen.jpg",
      source_photo_content_type: "image/jpeg",
      source_photo_byte_size: 123,
      source_photo_width: 1600,
      source_photo_height: 900,
      source_photo_priority: 0,
      source_photo_created_at: now,
    },
    error: null,
  });
  const rpc = vi.fn(() => ({ single: rpcSingle }));
  const from = vi.fn(() => createNextSortOrderBuilder(2));
  mocks.createClient.mockResolvedValue({ from, rpc });

  const result = await createTourSceneFromAuthoritativePhoto({
    projectId: "project-1",
    title: " Kitchen ",
    sourcePhoto: {
      storagePath: "user-1/project-1/kitchen.jpg",
      fileName: "kitchen.jpg",
      contentType: "image/jpeg",
      byteSize: 123,
      width: 1600,
      height: 900,
    },
  });

  expect(result.ok).toBe(true);
  expect(rpc).toHaveBeenCalledWith("create_tour_scene_with_source_photo", {
    p_project_id: "project-1",
    p_title: "Kitchen",
    p_sort_order: 3,
    p_included: true,
    p_camera_motion: "slow_push",
    p_storage_path: "user-1/project-1/kitchen.jpg",
    p_file_name: "kitchen.jpg",
    p_content_type: "image/jpeg",
    p_byte_size: 123,
    p_width: 1600,
    p_height: 900,
    p_priority: 0,
  });
});

test("reorder TourScenes adapter calls the reorder RPC with the complete requested order", async () => {
  const orderedSceneIds = ["scene-2", "scene-1"];
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const from = vi
    .fn()
    .mockReturnValueOnce(
      createListByIdsBuilder([
        sceneRow({ id: "scene-2", project_id: "project-1" }),
        sceneRow({ id: "scene-1", project_id: "project-1" }),
      ])
    )
    .mockReturnValueOnce(
      createOrderedScenesBuilder([
        sceneRow({ id: "scene-1", project_id: "project-1" }),
        sceneRow({ id: "scene-2", project_id: "project-1" }),
      ])
    )
    .mockReturnValueOnce(
      createOrderedScenesBuilder([
        sceneRow({ id: "scene-2", project_id: "project-1", sort_order: 0, title: "Bedroom" }),
        sceneRow({ id: "scene-1", project_id: "project-1", sort_order: 1, title: "Kitchen" }),
      ])
    )
    .mockReturnValueOnce(
      createOrderedSourcePhotosBuilder([
        sourcePhotoRow({ scene_id: "scene-2", storage_path: "user-1/project-1/bedroom.jpg" }),
        sourcePhotoRow({ scene_id: "scene-1", storage_path: "user-1/project-1/kitchen.jpg" }),
      ])
    );
  mocks.createClient.mockResolvedValue({ from, rpc });

  const result = await reorderTourScenes({
    projectId: "project-1",
    orderedSceneIds,
  });

  expect(result.ok).toBe(true);
  expect(rpc).toHaveBeenCalledWith("reorder_tour_scenes", {
    p_project_id: "project-1",
    p_ordered_scene_ids: orderedSceneIds,
  });
});
