import { randomUUID } from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { TourProjectType } from "@/lib/tours/project-types";
import type { TourSceneCameraMotion } from "@/lib/tours/scenes.core";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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
] as const;

export type TourRenderStep = (typeof TOUR_RENDER_STEPS)[number];

export type TourRenderRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TourRenderEventStatus = TourRenderRunStatus | "info";

export type TourRenderAssetKind =
  | "script_plan"
  | "narration_text"
  | "voiceover_audio"
  | "voiceover_transcript"
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

export type RenderableTourScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: TourSceneCameraMotion;
  authoritativePhoto: {
    id: string;
    storagePath: string;
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    byteSize: number;
    width: number | null;
    height: number | null;
  };
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

type TourProjectRow = {
  id: string;
  user_id: string;
  name: string;
  property_address: string;
  listing_url: string | null;
  tour_type: TourProjectType;
  status?: "open" | "archived";
};

type TourSceneRow = {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  included: boolean;
  camera_motion: TourSceneCameraMotion;
};

type TourSceneSourcePhotoRow = {
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

type TourSceneFactRow = {
  id: string;
  scene_id: string;
  fact_text: string;
  source_photo_id: string | null;
  sort_order: number;
  created_at: string;
};

type TourRenderRunRow = {
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

type TourRenderAssetRow = {
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
  getRenderRun(input: {
    runId: string;
    projectId: string;
    userId: string;
  }): Promise<TourRenderRun | null>;
  listRecentRenderRuns(input: {
    projectId: string;
    userId: string;
    limit?: number;
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
  findReusableAsset(input: {
    projectId: string;
    kind: TourRenderAssetKind;
    fingerprintHash: string;
    sceneId?: string | null;
  }): Promise<TourRenderAsset | null>;
};

const PROJECT_SELECT = "id, user_id, name, property_address, listing_url, tour_type, status";
const SCENE_SELECT = "id, project_id, title, sort_order, included, camera_motion";
const SOURCE_PHOTO_SELECT =
  "id, project_id, scene_id, storage_path, file_name, content_type, byte_size, width, height, priority, created_at";
const FACT_SELECT = "id, scene_id, fact_text, source_photo_id, sort_order, created_at";
const RUN_SELECT =
  "id, project_id, user_id, trigger_run_id, status, current_step, current_step_label, progress_percent, scene_clip_completed_count, scene_clip_total_count, options, error_message, result_asset_id, started_at, completed_at, heartbeat_at, created_at, updated_at";
const ASSET_SELECT =
  "id, created_by_run_id, project_id, scene_id, kind, storage_bucket, storage_path, content_type, fingerprint_hash, fingerprint, reusable, metadata, created_at";

function safeRenderMessage(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 500);
}

function mapRenderRun(row: TourRenderRunRow): TourRenderRun {
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

function mapRenderAsset(row: TourRenderAssetRow): TourRenderAsset {
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
    createdAt: row.created_at,
  };
}

function mapTourRenderPreflightProject(input: {
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
      const [authoritativePhoto] = [...(sourcePhotosBySceneId.get(scene.id) ?? [])].sort(
        (a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at)
      );
      return {
        id: scene.id,
        title: scene.title,
        sortOrder: scene.sort_order,
        included: scene.included,
        cameraMotion: scene.camera_motion,
        authoritativePhoto: authoritativePhoto
          ? {
              id: authoritativePhoto.id,
              storagePath: authoritativePhoto.storage_path,
              fileName: authoritativePhoto.file_name,
              contentType: authoritativePhoto.content_type,
              byteSize: authoritativePhoto.byte_size,
              width: authoritativePhoto.width,
              height: authoritativePhoto.height,
            }
          : null,
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
      status: input.project.status ?? "open",
    },
    scenes,
  };
}

async function loadTourRenderPreflightProject(
  supabase: SupabaseClient,
  input: { projectId: string; userId: string }
): Promise<TourRenderPreflightProject | null> {
  const { data: project, error: projectError } = await supabase
    .from("tours_projects")
    .select(PROJECT_SELECT)
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle<TourProjectRow>();

  if (projectError || !project) {
    return null;
  }

  const { data: scenes, error: scenesError } = await supabase
    .from("tour_scenes")
    .select(SCENE_SELECT)
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: true });

  if (scenesError || !scenes) {
    return null;
  }

  const { data: sourcePhotos, error: sourcePhotosError } = await supabase
    .from("tour_scene_source_photos")
    .select(SOURCE_PHOTO_SELECT)
    .eq("project_id", input.projectId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (sourcePhotosError || !sourcePhotos) {
    return null;
  }

  const { data: facts, error: factsError } = await supabase
    .from("tour_scene_facts")
    .select(FACT_SELECT)
    .eq("project_id", input.projectId)
    .eq("proof_status", "proofed")
    .order("scene_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (factsError || !facts) {
    return null;
  }

  return mapTourRenderPreflightProject({
    project,
    scenes: scenes as TourSceneRow[],
    sourcePhotos: sourcePhotos as TourSceneSourcePhotoRow[],
    facts: facts as TourSceneFactRow[],
  });
}

export async function createTourRenderRepository(): Promise<TourRenderRepository> {
  const supabase = await createClient();
  return createTourRenderRepositoryFromSupabase(supabase);
}

export function createServiceRoleTourRenderRepository(): TourRenderRepository {
  return createTourRenderRepositoryFromSupabase(createServiceRoleClient());
}

export function createTourRenderRepositoryFromSupabase(supabase: SupabaseClient): TourRenderRepository {
  return {
    async getTourRenderPreflightProject(input) {
      return loadTourRenderPreflightProject(supabase, input);
    },

    async getRenderableTourProject(input) {
      const preflightProject = await loadTourRenderPreflightProject(supabase, input);
      if (!preflightProject) {
        return null;
      }

      return {
        project: {
          id: preflightProject.project.id,
          userId: preflightProject.project.userId,
          name: preflightProject.project.name,
          propertyAddress: preflightProject.project.propertyAddress,
          listingUrl: preflightProject.project.listingUrl,
          tourType: preflightProject.project.tourType,
        },
        scenes: preflightProject.scenes.filter(
          (scene): scene is RenderableTourScene => scene.authoritativePhoto !== null
        ),
      };
    },

    async canReadListingMedia(input) {
      for (const storagePath of input.storagePaths) {
        const { data, error } = await supabase.storage
          .from("tours-listing-media")
          .createSignedUrl(storagePath, 60);

        if (error || !data?.signedUrl) {
          return false;
        }
      }

      return true;
    },

    async canWriteGeneratedMedia(input) {
      const storagePath = `${input.userId}/${input.projectId}/preflight/${randomUUID()}.json`;
      const bucket = supabase.storage.from("tours-generated-media");
      const { error: uploadError } = await bucket.upload(
        storagePath,
        new Blob([JSON.stringify({ ok: true })], { type: "application/json" }),
        {
          contentType: "application/json",
          upsert: false,
        }
      );

      if (uploadError) {
        return false;
      }

      const { error: removeError } = await bucket.remove([storagePath]);
      return !removeError;
    },

    async createSignedSourcePhotoUrls(input) {
      const bucket = supabase.storage.from("tours-listing-media");
      const signedUrls: SignedSourcePhotoUrl[] = [];

      for (const storagePath of input.storagePaths) {
        const { data, error } = await bucket.createSignedUrl(
          storagePath,
          input.expiresInSeconds ?? 5 * 60
        );

        if (error || !data?.signedUrl) {
          return [];
        }

        signedUrls.push({
          storagePath,
          signedUrl: data.signedUrl,
        });
      }

      return signedUrls;
    },

    async downloadListingMedia(input) {
      const { data, error } = await supabase.storage
        .from("tours-listing-media")
        .download(input.storagePath);

      if (error || !data) {
        return null;
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async uploadRenderAssetJson(input) {
      const storagePath = `${input.userId}/${input.projectId}/${input.runId}/${input.kind}-${randomUUID()}.json`;
      const content = JSON.stringify(input.value, null, 2);
      const contentType = "application/json";
      const { error } = await supabase.storage
        .from("tours-generated-media")
        .upload(storagePath, new Blob([content], { type: contentType }), {
          contentType,
          upsert: false,
        });

      if (error) {
        return null;
      }

      return {
        storageBucket: "tours-generated-media",
        storagePath,
        contentType,
      };
    },

    async uploadRenderAssetBytes(input) {
      const safeExtension = input.extension.replace(/^\./, "").replace(/[^a-z0-9]/gi, "");
      const storagePath = `${input.userId}/${input.projectId}/${input.runId}/${input.kind}-${randomUUID()}.${safeExtension || "bin"}`;
      const { error } = await supabase.storage
        .from("tours-generated-media")
        .upload(storagePath, input.content, {
          contentType: input.contentType,
          upsert: false,
        });

      if (error) {
        return null;
      }

      return {
        storageBucket: "tours-generated-media",
        storagePath,
        contentType: input.contentType,
      };
    },

    async downloadRenderAssetJson(input) {
      const { data, error } = await supabase.storage
        .from(input.storageBucket)
        .download(input.storagePath);

      if (error || !data) {
        return null;
      }

      try {
        return JSON.parse(await data.text());
      } catch {
        return null;
      }
    },

    async createRenderRun(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .insert({
          project_id: input.projectId,
          user_id: input.userId,
          status: "queued",
          current_step: "queued",
          current_step_label: "Queued",
          progress_percent: 0,
          scene_clip_completed_count: 0,
          scene_clip_total_count: input.sceneClipTotalCount ?? 0,
          options: input.options ?? {},
          heartbeat_at: now,
          updated_at: now,
        })
        .select(RUN_SELECT)
        .single<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async getRenderRun(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .select(RUN_SELECT)
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async listRecentRenderRuns(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .select(RUN_SELECT)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 5);

      if (error || !data) {
        return [];
      }

      return (data as TourRenderRunRow[]).map(mapRenderRun);
    },

    async attachTriggerRunId(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          trigger_run_id: input.triggerRunId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async updateProgress(input) {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: "running",
        current_step: input.step,
        current_step_label: input.label,
        progress_percent: input.progressPercent,
        heartbeat_at: now,
        updated_at: now,
      };

      if (typeof input.sceneClipCompletedCount === "number") {
        update.scene_clip_completed_count = input.sceneClipCompletedCount;
      }
      if (typeof input.sceneClipTotalCount === "number") {
        update.scene_clip_total_count = input.sceneClipTotalCount;
      }

      const { data, error } = await supabase
        .from("tour_render_runs")
        .update(update)
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async markCompleted(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          status: "completed",
          current_step: "completed",
          current_step_label: "Completed",
          progress_percent: 100,
          result_asset_id: input.resultAssetId,
          completed_at: now,
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async markFailed(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          status: "failed",
          current_step: input.step,
          current_step_label: input.label,
          error_message: safeRenderMessage(input.safeMessage),
          completed_at: now,
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async recordHeartbeat(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async appendEvent(input) {
      const { data, error } = await supabase
        .from("tour_render_run_events")
        .insert({
          run_id: input.runId,
          project_id: input.projectId,
          step: input.step,
          status: input.status,
          message: safeRenderMessage(input.safeMessage),
          metadata: input.metadata ?? {},
        })
        .select("id")
        .single<{ id: string }>();

      return !error && Boolean(data);
    },

    async createAsset(input) {
      const { data, error } = await supabase
        .from("tour_render_assets")
        .insert({
          project_id: input.projectId,
          scene_id: input.sceneId ?? null,
          created_by_run_id: input.createdByRunId ?? null,
          kind: input.kind,
          storage_bucket: input.storageBucket ?? null,
          storage_path: input.storagePath ?? null,
          content_type: input.contentType ?? null,
          fingerprint_hash: input.fingerprintHash,
          fingerprint: input.fingerprint,
          reusable: input.reusable ?? true,
          metadata: input.metadata ?? {},
        })
        .select(ASSET_SELECT)
        .single<TourRenderAssetRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderAsset(data);
    },

    async recordRunAssetUsage(input) {
      const { data, error } = await supabase
        .from("tour_render_run_assets")
        .insert({
          run_id: input.runId,
          asset_id: input.assetId,
          usage: input.usage,
        })
        .select("run_id")
        .single<{ run_id: string }>();

      return !error && Boolean(data);
    },

    async findReusableAsset(input) {
      let query = supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("project_id", input.projectId)
        .eq("kind", input.kind)
        .eq("fingerprint_hash", input.fingerprintHash)
        .eq("reusable", true);

      query =
        input.sceneId === undefined
          ? query
          : input.sceneId === null
            ? query.is("scene_id", null)
            : query.eq("scene_id", input.sceneId);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<TourRenderAssetRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderAsset(data);
    },
  };
}
