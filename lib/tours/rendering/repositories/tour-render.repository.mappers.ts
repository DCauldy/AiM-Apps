import type {
  TourProjectRow,
  TourRenderAsset,
  TourRenderAssetRow,
  TourRenderPreflightProject,
  TourRenderPreflightScene,
  TourRenderRun,
  TourRenderRunRow,
  TourSceneFactRow,
  TourSceneRow,
  TourSceneSourcePhotoRow,
} from "./tour-render.repository.types";
import {
  DEFAULT_SCENE_TRANSITION_EFFECT,
  isSceneTransitionEffect,
} from "../transitions/scene-transition-effects";

export const PROJECT_SELECT = "id, user_id, name, property_address, listing_url, tour_type, status, heygen_avatar_id, heygen_avatar_placement";
export const SCENE_SELECT = "id, project_id, title, sort_order, included, camera_motion";
export const SCENE_WITH_TRANSITION_SELECT = `${SCENE_SELECT}, transition_effect`;
export const SOURCE_PHOTO_SELECT =
  "id, project_id, scene_id, storage_path, file_name, content_type, byte_size, width, height, priority, created_at";
export const FACT_SELECT = "id, scene_id, fact_text, source_photo_id, sort_order, created_at";
export const RUN_SELECT =
  "id, project_id, user_id, trigger_run_id, status, current_step, current_step_label, progress_percent, scene_clip_completed_count, scene_clip_total_count, options, error_message, result_asset_id, started_at, completed_at, heartbeat_at, created_at, updated_at";
export const ASSET_SELECT =
  "id, created_by_run_id, project_id, scene_id, kind, storage_bucket, storage_path, content_type, fingerprint_hash, fingerprint, reusable, metadata, deleted_at, storage_deleted_at, delete_reason, created_at";

export function safeRenderMessage(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 500);
}

export function mapRenderRun(row: TourRenderRunRow): TourRenderRun {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    triggerRunId: row.trigger_run_id,
    status: row.status,
    currentStep: row.current_step,
    currentStepLabel: row.current_step_label,
    progressPercent: row.progress_percent,
    sceneClipCompletedCount: row.scene_clip_completed_count,
    sceneClipTotalCount: row.scene_clip_total_count,
    options: row.options,
    errorMessage: row.error_message,
    resultAssetId: row.result_asset_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    heartbeatAt: row.heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRenderAsset(row: TourRenderAssetRow): TourRenderAsset {
  return {
    id: row.id,
    createdByRunId: row.created_by_run_id,
    projectId: row.project_id,
    sceneId: row.scene_id,
    kind: row.kind,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    contentType: row.content_type,
    fingerprintHash: row.fingerprint_hash,
    fingerprint: row.fingerprint,
    reusable: row.reusable,
    metadata: row.metadata,
    deletedAt: row.deleted_at,
    storageDeletedAt: row.storage_deleted_at,
    deleteReason: row.delete_reason,
    createdAt: row.created_at,
  };
}

export function mapTourRenderPreflightProject(input: {
  project: TourProjectRow;
  scenes: TourSceneRow[];
  sourcePhotos: TourSceneSourcePhotoRow[];
  facts: TourSceneFactRow[];
}): TourRenderPreflightProject {
  const sourcePhotosBySceneId = new Map<string, TourSceneSourcePhotoRow[]>();
  for (const sourcePhoto of input.sourcePhotos) {
    const scenePhotos = sourcePhotosBySceneId.get(sourcePhoto.scene_id) ?? [];
    scenePhotos.push(sourcePhoto);
    sourcePhotosBySceneId.set(sourcePhoto.scene_id, scenePhotos);
  }

  const proofedFactsBySceneId = new Map<string, TourSceneFactRow[]>();
  for (const fact of input.facts) {
    const sceneFacts = proofedFactsBySceneId.get(fact.scene_id) ?? [];
    sceneFacts.push(fact);
    proofedFactsBySceneId.set(fact.scene_id, sceneFacts);
  }

  const scenes = [...input.scenes]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((scene) => {
      const sortedSourcePhotos = [...(sourcePhotosBySceneId.get(scene.id) ?? [])].sort(
        (a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at)
      );
      const [authoritativePhoto] = sortedSourcePhotos;
      return {
        id: scene.id,
        title: scene.title,
        sortOrder: scene.sort_order,
        included: scene.included,
        cameraMotion: scene.camera_motion,
        transitionEffect: isSceneTransitionEffect(scene.transition_effect)
          ? scene.transition_effect
          : DEFAULT_SCENE_TRANSITION_EFFECT,
        authoritativePhoto: authoritativePhoto
          ? {
              id: authoritativePhoto.id,
              storagePath: authoritativePhoto.storage_path,
              fileName: authoritativePhoto.file_name,
              contentType: authoritativePhoto.content_type,
              byteSize: authoritativePhoto.byte_size,
              width: authoritativePhoto.width,
              height: authoritativePhoto.height,
              priority: authoritativePhoto.priority,
            }
          : null,
        sourcePhotos: sortedSourcePhotos.map((photo) => ({
          id: photo.id,
          storagePath: photo.storage_path,
          fileName: photo.file_name,
          contentType: photo.content_type,
          byteSize: photo.byte_size,
          width: photo.width,
          height: photo.height,
          priority: photo.priority,
        })),
        proofedFacts: [...(proofedFactsBySceneId.get(scene.id) ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map((fact) => ({
            id: fact.id,
            text: fact.fact_text,
            sortOrder: fact.sort_order,
            sourcePhotoId: fact.source_photo_id,
          })),
      } satisfies TourRenderPreflightScene;
    });

  return {
    project: {
      id: input.project.id,
      userId: input.project.user_id,
      name: input.project.name,
      propertyAddress: input.project.property_address,
      listingUrl: input.project.listing_url,
      tourType: input.project.tour_type,
      heyGenAvatarId: input.project.heygen_avatar_id,
      heyGenAvatarPlacement: input.project.heygen_avatar_placement,
      status: input.project.status ?? "open",
    },
    scenes,
  };
}
