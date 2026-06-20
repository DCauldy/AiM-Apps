import type { createClient } from "@/lib/supabase/server";
import type { HeyGenAvatarProjectPosition } from "@/lib/tours/avatar-settings/avatar-project-settings";
import type { TourProjectType } from "@/lib/tours/projects/project-types";
import type { TourSceneCameraMotion } from "@/lib/tours/scenes.core";

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export const TOUR_RENDER_STEPS = [
  "queued",
  "preparing_assets",
  "planning_script",
  "generating_voiceover",
  "generating_avatar",
  "detecting_transitions",
  "rendering_scene_clips",
  "joining_video",
  "uploading_final",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TourRenderStep = (typeof TOUR_RENDER_STEPS)[number];

export type TourRenderRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TourRenderEventStatus = TourRenderRunStatus | "info";

export type TourRenderAssetKind =
  | "script_plan"
  | "narration_text"
  | "voiceover_audio"
  | "voiceover_transcript"
  | "avatar_video"
  | "avatar_metadata"
  | "scene_transitions"
  | "scene_durations"
  | "scene_clip"
  | "joined_scenes"
  | "final_video";

export type TourRenderRunAssetUsage = "created" | "reused" | "used" | "result";

export type RenderableTourProject = {
  project: {
    id: string;
    userId: string;
    name: string;
    propertyAddress: string;
    listingUrl: string | null;
    tourType: TourProjectType;
    heyGenAvatarId?: string | null;
    heyGenAvatarPlacement?: HeyGenAvatarProjectPosition | null;
  };
  scenes: RenderableTourScene[];
};

export type TourRenderPreflightProject = {
  project: RenderableTourProject["project"] & {
    status: "open" | "archived";
  };
  scenes: TourRenderPreflightScene[];
};

export type TourRenderPreflightScene = Omit<RenderableTourScene, "authoritativePhoto"> & {
  authoritativePhoto: RenderableTourScene["authoritativePhoto"] | null;
};

export type RenderableTourSceneSourcePhoto = {
  id: string;
  storagePath: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number | null;
  height: number | null;
  priority: number;
};

export type RenderableTourScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: TourSceneCameraMotion;
  authoritativePhoto: RenderableTourSceneSourcePhoto;
  sourcePhotos: RenderableTourSceneSourcePhoto[];
  proofedFacts: Array<{
    id: string;
    text: string;
    sortOrder: number;
    sourcePhotoId: string | null;
  }>;
};

export type TourRenderRun = {
  id: string;
  projectId: string;
  userId: string;
  triggerRunId: string | null;
  status: TourRenderRunStatus;
  currentStep: string;
  currentStepLabel: string;
  progressPercent: number;
  sceneClipCompletedCount: number;
  sceneClipTotalCount: number;
  options: Record<string, unknown>;
  errorMessage: string | null;
  resultAssetId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TourRenderAsset = {
  id: string;
  createdByRunId: string | null;
  projectId: string;
  sceneId: string | null;
  kind: TourRenderAssetKind;
  storageBucket: string | null;
  storagePath: string | null;
  contentType: string | null;
  fingerprintHash: string;
  fingerprint: Record<string, unknown>;
  reusable: boolean;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  storageDeletedAt: string | null;
  deleteReason: string | null;
  createdAt: string;
};

export type SignedSourcePhotoUrl = {
  storagePath: string;
  signedUrl: string;
};

export type UploadedRenderAsset = {
  storageBucket: "tours-generated-media";
  storagePath: string;
  contentType: string;
};

export type SignedGeneratedMediaUrl = {
  storageBucket: "tours-generated-media";
  storagePath: string;
  signedUrl: string;
};

export type TourProjectRow = {
  id: string;
  user_id: string;
  name: string;
  property_address: string;
  listing_url: string | null;
  tour_type: TourProjectType;
  status?: "open" | "archived";
  heygen_avatar_id: string | null;
  heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
};

export type TourSceneRow = {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  included: boolean;
  camera_motion: TourSceneCameraMotion;
};

export type TourSceneSourcePhotoRow = {
  id: string;
  project_id: string;
  scene_id: string;
  storage_path: string;
  file_name: string;
  content_type: RenderableTourScene["authoritativePhoto"]["contentType"];
  byte_size: number;
  width: number | null;
  height: number | null;
  priority: number;
  created_at: string;
};

export type TourSceneFactRow = {
  id: string;
  scene_id: string;
  fact_text: string;
  source_photo_id: string | null;
  sort_order: number;
  created_at: string;
};

export type TourRenderRunRow = {
  id: string;
  project_id: string;
  user_id: string;
  trigger_run_id: string | null;
  status: TourRenderRunStatus;
  current_step: string;
  current_step_label: string;
  progress_percent: number;
  scene_clip_completed_count: number;
  scene_clip_total_count: number;
  options: Record<string, unknown>;
  error_message: string | null;
  result_asset_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TourRenderAssetRow = {
  id: string;
  created_by_run_id: string | null;
  project_id: string;
  scene_id: string | null;
  kind: TourRenderAssetKind;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  fingerprint_hash: string;
  fingerprint: Record<string, unknown>;
  reusable: boolean;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  storage_deleted_at: string | null;
  delete_reason: string | null;
  created_at: string;
};

export type CreateTourRenderRunInput = {
  projectId: string;
  userId: string;
  options?: Record<string, unknown>;
  sceneClipTotalCount?: number;
};

export type UpdateTourRenderProgressInput = {
  runId: string;
  projectId: string;
  userId: string;
  step: TourRenderStep;
  label: string;
  progressPercent: number;
  sceneClipCompletedCount?: number;
  sceneClipTotalCount?: number;
};

export type DeleteTourRenderAssetReason = "fresh_render_superseded" | "retention_expired" | (string & {});

export type DeleteGeneratedAssetsResult = {
  scanned: number;
  storageDeleted: number;
  softDeleted: number;
  skipped: number;
  failed: number;
  failures: Array<{ assetId: string; message: string }>;
};

export type SupersededFreshRenderAssetCandidates = {
  candidateAssetIds: string[];
  keepAssetIds: string[];
  activeAssetIds: string[];
};

export type RetentionExpiredAssetCandidates = {
  candidateAssetIds: string[];
  currentFinalAssetIds: string[];
  activeAssetIds: string[];
  scanned: number;
  nextCursor: { createdAt: string; id: string } | null;
};

export type CreateTourRenderAssetInput = {
  projectId: string;
  sceneId?: string | null;
  createdByRunId?: string | null;
  kind: TourRenderAssetKind;
  storageBucket?: string | null;
  storagePath?: string | null;
  contentType?: string | null;
  fingerprintHash: string;
  fingerprint: Record<string, unknown>;
  reusable?: boolean;
  metadata?: Record<string, unknown>;
};

export type TourRenderRepository = {
  getTourRenderPreflightProject(input: {
    projectId: string;
    userId: string;
  }): Promise<TourRenderPreflightProject | null>;
  getRenderableTourProject(input: {
    projectId: string;
    userId: string;
  }): Promise<RenderableTourProject | null>;
  canReadListingMedia(input: { storagePaths: string[] }): Promise<boolean>;
  canWriteGeneratedMedia(input: { userId: string; projectId: string }): Promise<boolean>;
  createSignedSourcePhotoUrls(input: {
    storagePaths: string[];
    expiresInSeconds?: number;
  }): Promise<SignedSourcePhotoUrl[]>;
  downloadListingMedia(input: { storagePath: string }): Promise<Buffer | null>;
  uploadRenderAssetJson(input: {
    userId: string;
    projectId: string;
    runId: string;
    kind: TourRenderAssetKind;
    value: unknown;
  }): Promise<UploadedRenderAsset | null>;
  uploadRenderAssetBytes(input: {
    userId: string;
    projectId: string;
    runId: string;
    kind: TourRenderAssetKind;
    content: Buffer | Blob;
    contentType: string;
    extension: string;
  }): Promise<UploadedRenderAsset | null>;
  downloadRenderAssetJson(input: {
    storageBucket: "tours-generated-media";
    storagePath: string;
  }): Promise<unknown | null>;
  downloadRenderAssetBytes(input: {
    storageBucket: "tours-generated-media";
    storagePath: string;
  }): Promise<Buffer | null>;
  createSignedGeneratedMediaUrl(input: {
    storageBucket: "tours-generated-media";
    storagePath: string;
    expiresInSeconds?: number;
    downloadTitle?: string;
  }): Promise<SignedGeneratedMediaUrl | null>;
  getAsset(input: {
    assetId: string;
    projectId: string;
  }): Promise<TourRenderAsset | null>;
  getRenderRun(input: {
    runId: string;
    projectId: string;
    userId: string;
  }): Promise<TourRenderRun | null>;
  getRenderRunByIdForUser(input: {
    runId: string;
    userId: string;
  }): Promise<TourRenderRun | null>;
  listRecentRenderRuns(input: {
    projectId: string;
    userId: string;
    limit?: number;
  }): Promise<TourRenderRun[]>;
  listActiveProjectRenderRuns(input: {
    projectId: string;
    userId: string;
  }): Promise<TourRenderRun[]>;
  createRenderRun(input: CreateTourRenderRunInput): Promise<TourRenderRun | null>;
  attachTriggerRunId(input: {
    runId: string;
    projectId: string;
    userId: string;
    triggerRunId: string;
  }): Promise<TourRenderRun | null>;
  updateProgress(input: UpdateTourRenderProgressInput): Promise<TourRenderRun | null>;
  markCompleted(input: {
    runId: string;
    projectId: string;
    userId: string;
    resultAssetId?: string | null;
  }): Promise<TourRenderRun | null>;
  markFailed(input: {
    runId: string;
    projectId: string;
    userId: string;
    step: TourRenderStep;
    label: string;
    safeMessage: string;
  }): Promise<TourRenderRun | null>;
  markCancelled(input: {
    runId: string;
    projectId: string;
    userId: string;
    safeMessage: string;
  }): Promise<TourRenderRun | null>;
  recordHeartbeat(input: {
    runId: string;
    projectId: string;
    userId: string;
  }): Promise<TourRenderRun | null>;
  appendEvent(input: {
    runId: string;
    projectId: string;
    step: TourRenderStep;
    status: TourRenderEventStatus;
    safeMessage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<boolean>;
  createAsset(input: CreateTourRenderAssetInput): Promise<TourRenderAsset | null>;
  recordRunAssetUsage(input: {
    runId: string;
    assetId: string;
    usage: TourRenderRunAssetUsage;
  }): Promise<boolean>;
  listRunAssets(input: {
    runId: string;
    projectId: string;
  }): Promise<TourRenderAsset[]>;
  findReusableAsset(input: {
    projectId: string;
    kind: TourRenderAssetKind;
    fingerprintHash: string;
    sceneId?: string | null;
  }): Promise<TourRenderAsset | null>;
  markProjectAssetsNonReusable(input: {
    projectId: string;
  }): Promise<boolean>;
  deleteGeneratedAssets(input: {
    assetIds: string[];
    reason: DeleteTourRenderAssetReason;
    batchSize?: number;
  }): Promise<DeleteGeneratedAssetsResult>;
  listSupersededFreshRenderAssetIds(input: {
    projectId: string;
    completedRunId: string;
    resultAssetId: string;
  }): Promise<SupersededFreshRenderAssetCandidates>;
  listRetentionExpiredAssetIds(input: {
    cutoffIso: string;
    limit: number;
    cursor?: { createdAt: string; id: string } | null;
  }): Promise<RetentionExpiredAssetCandidates>;
};
