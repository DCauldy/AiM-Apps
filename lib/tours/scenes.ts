import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  createTourSceneFromAuthoritativePhoto as createTourSceneFromAuthoritativePhotoWithRepository,
  listTourScenesForProject,
  reorderTourScenesForProject,
  toggleTourSceneInclusionForProject,
  type CreateTourSceneResult,
  type ReorderTourScenesResult,
  type ToggleTourSceneInclusionResult,
  type NewTourSceneSourcePhoto,
  type TourSceneCameraMotion,
  type TourSceneModel,
  type TourSceneRow,
  type TourSceneSourcePhotoRow,
  type TourScenesRepository,
} from "./scenes.core";

const SCENE_SELECT = "id, project_id, title, sort_order, included, camera_motion, created_at, updated_at";
const SOURCE_PHOTO_SELECT =
  "id, project_id, scene_id, storage_path, file_name, content_type, byte_size, width, height, priority, created_at";

type CreateSceneWithSourcePhotoRpcRow = {
  scene_id: string;
  scene_project_id: string;
  scene_title: string;
  scene_sort_order: number;
  scene_included: boolean;
  scene_camera_motion: TourSceneCameraMotion;
  scene_created_at: string;
  scene_updated_at: string;
  source_photo_id: string;
  source_photo_project_id: string;
  source_photo_scene_id: string;
  source_photo_storage_path: string;
  source_photo_file_name: string;
  source_photo_content_type: TourSceneSourcePhotoRow["content_type"];
  source_photo_byte_size: number;
  source_photo_width: number | null;
  source_photo_height: number | null;
  source_photo_priority: number;
  source_photo_created_at: string;
};

async function createSupabaseTourScenesRepository(): Promise<TourScenesRepository> {
  const supabase = await createClient();

  return {
    async getNextSceneSortOrder(projectId) {
      const { data } = await supabase
        .from("tour_scenes")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle<{ sort_order: number }>();

      return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
    },
    async createSceneWithSourcePhoto(input) {
      const { data, error } = await supabase
        .rpc("create_tour_scene_with_source_photo", {
          p_project_id: input.projectId,
          p_title: input.title,
          p_sort_order: input.sortOrder,
          p_included: input.included,
          p_camera_motion: input.cameraMotion,
          p_storage_path: input.authoritativePhoto.storagePath,
          p_file_name: input.authoritativePhoto.fileName,
          p_content_type: input.authoritativePhoto.contentType,
          p_byte_size: input.authoritativePhoto.byteSize,
          p_width: input.authoritativePhoto.width ?? null,
          p_height: input.authoritativePhoto.height ?? null,
          p_priority: input.authoritativePhoto.priority,
        })
        .single<CreateSceneWithSourcePhotoRpcRow>();

      if (error || !data) {
        return null;
      }

      const scene: TourSceneRow = {
        id: data.scene_id,
        project_id: data.scene_project_id,
        title: data.scene_title,
        sort_order: data.scene_sort_order,
        included: data.scene_included,
        camera_motion: data.scene_camera_motion,
        created_at: data.scene_created_at,
        updated_at: data.scene_updated_at,
      };
      const sourcePhoto: TourSceneSourcePhotoRow = {
        id: data.source_photo_id,
        project_id: data.source_photo_project_id,
        scene_id: data.source_photo_scene_id,
        storage_path: data.source_photo_storage_path,
        file_name: data.source_photo_file_name,
        content_type: data.source_photo_content_type,
        byte_size: data.source_photo_byte_size,
        width: data.source_photo_width,
        height: data.source_photo_height,
        priority: data.source_photo_priority,
        created_at: data.source_photo_created_at,
      };

      return { scene, sourcePhotos: [sourcePhoto] };
    },
    async listSceneRowsWithSourcePhotos(projectId) {
      const { data: scenes, error: scenesError } = await supabase
        .from("tour_scenes")
        .select(SCENE_SELECT)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      if (scenesError || !scenes || scenes.length === 0) {
        return [];
      }

      const sceneIds = scenes.map((scene) => scene.id);
      const { data: sourcePhotos, error: sourcePhotosError } = await supabase
        .from("tour_scene_source_photos")
        .select(SOURCE_PHOTO_SELECT)
        .in("scene_id", sceneIds)
        .order("priority", { ascending: true });

      if (sourcePhotosError) {
        return [];
      }

      return scenes.map((scene) => ({
        scene,
        sourcePhotos: (sourcePhotos ?? []).filter((photo) => photo.scene_id === scene.id),
      }));
    },
    async listSceneRowsForProject(projectId) {
      const { data, error } = await supabase
        .from("tour_scenes")
        .select(SCENE_SELECT)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      if (error || !data) {
        return [];
      }

      return data;
    },
    async listSceneRowsByIds(sceneIds) {
      if (sceneIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("tour_scenes")
        .select(SCENE_SELECT)
        .in("id", sceneIds);

      if (error || !data) {
        return [];
      }

      return data;
    },
    async persistSceneOrder(projectId, orderedSceneIds) {
      const { data, error } = await supabase.rpc("reorder_tour_scenes", {
        p_project_id: projectId,
        p_ordered_scene_ids: orderedSceneIds,
      });

      return !error && data === true;
    },
    async updateSceneInclusion(projectId, sceneId, included) {
      const { data: scene, error: sceneError } = await supabase
        .from("tour_scenes")
        .update({ included, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("id", sceneId)
        .select(SCENE_SELECT)
        .maybeSingle<TourSceneRow>();

      if (sceneError || !scene) {
        return null;
      }

      const { data: sourcePhotos, error: sourcePhotosError } = await supabase
        .from("tour_scene_source_photos")
        .select(SOURCE_PHOTO_SELECT)
        .eq("scene_id", sceneId)
        .order("priority", { ascending: true });

      if (sourcePhotosError) {
        return null;
      }

      return { scene, sourcePhotos: sourcePhotos ?? [] };
    },
  };
}

export type { NewTourSceneSourcePhoto, TourSceneCameraMotion, TourSceneModel };

type DeleteTourSceneRpcRow = {
  removed_storage_path: string;
};

export async function createTourSceneFromAuthoritativePhoto(input: {
  projectId: string;
  title: string;
  sourcePhoto: NewTourSceneSourcePhoto;
}): Promise<CreateTourSceneResult> {
  const repository = await createSupabaseTourScenesRepository();
  return createTourSceneFromAuthoritativePhotoWithRepository(input, repository);
}

export async function getTourScenesForProject(projectId: string): Promise<TourSceneModel[]> {
  const repository = await createSupabaseTourScenesRepository();
  return listTourScenesForProject(projectId, repository);
}

export async function reorderTourScenes(input: {
  projectId: string;
  orderedSceneIds: string[];
}): Promise<ReorderTourScenesResult> {
  const repository = await createSupabaseTourScenesRepository();
  return reorderTourScenesForProject(input.projectId, input.orderedSceneIds, repository);
}

export async function toggleTourSceneInclusion(input: {
  projectId: string;
  sceneId: string;
  included: boolean;
}): Promise<ToggleTourSceneInclusionResult> {
  const repository = await createSupabaseTourScenesRepository();
  return toggleTourSceneInclusionForProject(input.projectId, input.sceneId, input.included, repository);
}

export async function deleteTourScene(input: {
  projectId: string;
  sceneId: string;
}): Promise<{ ok: true; storagePaths: string[] } | { ok: false; error: string }> {
  if (!input.sceneId) {
    return { ok: false, error: "Choose a TourScene to remove." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_tour_scene", {
    p_project_id: input.projectId,
    p_scene_id: input.sceneId,
  });

  if (error) {
    return { ok: false, error: error.message || "Could not remove the TourScene." };
  }

  const rows = (data ?? []) as DeleteTourSceneRpcRow[];
  return {
    ok: true,
    storagePaths: rows
      .map((row) => row.removed_storage_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  };
}
