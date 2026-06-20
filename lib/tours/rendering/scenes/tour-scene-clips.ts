import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  RenderableTourProject,
  RenderableTourScene,
  RenderableTourSceneSourcePhoto,
  TourRenderAsset,
  TourRenderRepository,
} from "../repositories/tour-render.repository";
import type { SceneDuration } from "../transitions/tour-transitions";
import { getDefaultTourRenderMode, type TourRenderMode } from "../preflight/tour-render-preflight";
import { TourSceneClipRenderError } from "./tour-scene-clip-errors";
import {
  buildSceneClipTransitionFingerprint,
  planSceneClipHandles,
  resolveTourSceneTransitionSettings,
  type SceneClipHandlePlan,
  type SceneClipTransitionFingerprint,
  type TourSceneTransitionSettings,
} from "../transitions/tour-render-transitions";
import {
  assertVideoDurationAtLeast,
  probeVideoDurationSeconds,
  type VideoDurationProbe,
} from "../final-render/video-duration";

export const KEN_BURNS_SCENE_CLIP_RENDERER_VERSION = "ken-burns-ffmpeg-v1";
export const PROVIDER_SCENE_CLIP_RENDERER_VERSION = "provider-image-to-video-v3";
export const DEFAULT_SCENE_CLIP_PROVIDER_MODEL = "kwaivgi/kling-v3.0-std";
export { TourSceneClipRenderError } from "./tour-scene-clip-errors";
export { createOpenRouterImageToVideoProvider } from "./tour-scene-clip-openrouter";

export type SceneClipRenderSettings = {
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
  fadeSeconds?: number;
  cropMode?: "cover" | "contain";
};

export type ResolvedSceneClipRenderSettings = Required<SceneClipRenderSettings>;

export type SceneClipStageOptions = {
  renderMode?: TourRenderMode;
  reuseExistingAssets?: boolean;
  providerModelId?: string;
  includeSecondarySourceImages?: boolean;
  renderSettings?: SceneClipRenderSettings;
  concurrencyLimit?: number;
  sceneTransitions?: {
    enabled?: boolean;
  };
};

export type SceneClipRendererInput = {
  scene: RenderableTourScene;
  sourceImagePath: string;
  outputVideoPath: string;
  durationSeconds: number;
  settings: ResolvedSceneClipRenderSettings;
  ffmpegPath: string;
  ffprobePath: string;
};

export type SceneClipRenderer = {
  renderSceneClip(input: SceneClipRendererInput): Promise<{ metadata?: Record<string, unknown> }>;
};

export type ImageToVideoProviderInput = {
  scene: RenderableTourScene;
  sourceImageUrl: string;
  secondarySourceImageUrls: string[];
  durationSeconds: number;
  modelId: string;
  settings: ResolvedSceneClipRenderSettings;
};

export type ImageToVideoProvider = {
  renderSceneClip(input: ImageToVideoProviderInput): Promise<{
    outputUrl: string;
    downloadHeaders?: Record<string, string>;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type ProviderSceneClipNormalizerInput = {
  inputVideoPath: string;
  outputVideoPath: string;
  settings: ResolvedSceneClipRenderSettings;
  ffmpegPath: string;
};

export type ProviderSceneClipNormalizer = {
  normalizeSceneClip(
    input: ProviderSceneClipNormalizerInput
  ): Promise<{ metadata?: Record<string, unknown> }>;
};

export type SceneClipStageResult = {
  clips: Array<{
    sceneId: string;
    durationSeconds: number;
    asset: TourRenderAsset;
    reused: boolean;
    fingerprintHash: string;
    fingerprint: SceneClipFingerprint;
    requestedDurationSeconds: number;
    handlePlan: SceneClipHandlePlan;
  }>;
  completedCount: number;
  totalCount: number;
};

export type SceneClipStageClip = SceneClipStageResult["clips"][number];

export type SceneClipBatchItem = {
  index: number;
  scene: RenderableTourScene;
  duration: SceneDuration;
  handlePlan: SceneClipHandlePlan;
  projectId: string;
  runId: string;
  userId: string;
  options: ReturnType<typeof resolveSceneClipStageOptions>;
};

export type SceneClipBatchResult = {
  index: number;
  clip: SceneClipStageClip;
};

export type SceneClipBatchRunner = (items: SceneClipBatchItem[]) => Promise<SceneClipBatchResult[]>;

export type SceneClipFingerprint = {
  kind: "scene_clip";
  version: 1;
  adapterVersion: string;
  renderMode: TourRenderMode;
  provider: {
    name: "ken_burns_ffmpeg" | "openrouter";
    modelId: string | null;
  };
  scene: {
    id: string;
    sortOrder: number;
    title: string;
    cameraMotion: RenderableTourScene["cameraMotion"];
  };
  sourcePhoto: {
    id: string;
    storagePath: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
  };
  secondarySourcePhotos: Array<SceneClipFingerprint["sourcePhoto"] & { priority: number }>;
  durationSeconds: number;
  targetDurationSeconds: number;
  transition: SceneClipTransitionFingerprint;
  renderSettings: ResolvedSceneClipRenderSettings;
};

const DEFAULT_RENDER_SETTINGS: ResolvedSceneClipRenderSettings = {
  width: 1080,
  height: 1920,
  fps: 30,
  crf: 18,
  fadeSeconds: 0.25,
  cropMode: "cover",
};
const DEFAULT_SCENE_CLIP_CONCURRENCY_LIMIT = 2;
const MAX_SCENE_CLIP_CONCURRENCY_LIMIT = 4;

function normalizeConcurrencyLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SCENE_CLIP_CONCURRENCY_LIMIT;
  }
  return Math.max(1, Math.min(MAX_SCENE_CLIP_CONCURRENCY_LIMIT, Math.floor(value)));
}

export function resolveSceneClipStageOptions(
  options: SceneClipStageOptions = {}
): {
  renderMode: TourRenderMode;
  reuseExistingAssets: boolean;
  providerModelId: string;
  includeSecondarySourceImages: boolean;
  renderSettings: ResolvedSceneClipRenderSettings;
  concurrencyLimit: number;
  sceneTransitions: TourSceneTransitionSettings;
} {
  return {
    renderMode: options.renderMode ?? getDefaultTourRenderMode(),
    reuseExistingAssets: options.reuseExistingAssets !== false,
    providerModelId: options.providerModelId ?? DEFAULT_SCENE_CLIP_PROVIDER_MODEL,
    includeSecondarySourceImages: options.includeSecondarySourceImages !== false,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(options.renderSettings ?? {}),
    },
    concurrencyLimit: normalizeConcurrencyLimit(options.concurrencyLimit),
    sceneTransitions: resolveTourSceneTransitionSettings(options.sceneTransitions),
  };
}

export function buildSceneClipFingerprint(input: {
  scene: RenderableTourScene;
  durationSeconds: number;
  handlePlan: SceneClipHandlePlan;
  sceneTransitions: TourSceneTransitionSettings;
  renderMode: TourRenderMode;
  providerModelId: string;
  includeSecondarySourceImages: boolean;
  renderSettings: ResolvedSceneClipRenderSettings;
}): SceneClipFingerprint {
  const adapterVersion =
    input.renderMode === "provider_image_to_video"
      ? PROVIDER_SCENE_CLIP_RENDERER_VERSION
      : KEN_BURNS_SCENE_CLIP_RENDERER_VERSION;

  return {
    kind: "scene_clip",
    version: 1,
    adapterVersion,
    renderMode: input.renderMode,
    provider:
      input.renderMode === "provider_image_to_video"
        ? { name: "openrouter", modelId: input.providerModelId }
        : { name: "ken_burns_ffmpeg", modelId: null },
    scene: {
      id: input.scene.id,
      sortOrder: input.scene.sortOrder,
      title: input.scene.title,
      cameraMotion: input.scene.cameraMotion,
    },
    sourcePhoto: {
      id: input.scene.authoritativePhoto.id,
      storagePath: input.scene.authoritativePhoto.storagePath,
      fileName: input.scene.authoritativePhoto.fileName,
      contentType: input.scene.authoritativePhoto.contentType,
      byteSize: input.scene.authoritativePhoto.byteSize,
      width: input.scene.authoritativePhoto.width,
      height: input.scene.authoritativePhoto.height,
    },
    secondarySourcePhotos:
      input.renderMode === "provider_image_to_video" && input.includeSecondarySourceImages
        ? getSecondarySourcePhotos(input.scene).map((photo) => ({
            id: photo.id,
            storagePath: photo.storagePath,
            fileName: photo.fileName,
            contentType: photo.contentType,
            byteSize: photo.byteSize,
            width: photo.width,
            height: photo.height,
            priority: photo.priority,
          }))
        : [],
    durationSeconds: input.durationSeconds,
    targetDurationSeconds: input.handlePlan.targetDurationSeconds,
    transition: buildSceneClipTransitionFingerprint({
      transitionSettings: input.sceneTransitions,
      handlePlan: input.handlePlan,
    }),
    renderSettings: input.renderSettings,
  };
}

export function hashSceneClipFingerprint(fingerprint: SceneClipFingerprint): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export async function renderSceneClipsStage(input: {
  project: RenderableTourProject;
  repository: TourRenderRepository;
  runId: string;
  userId: string;
  durations: SceneDuration[];
  renderer?: SceneClipRenderer;
  provider?: ImageToVideoProvider;
  providerNormalizer?: ProviderSceneClipNormalizer;
  fetcher?: typeof fetch;
  options?: SceneClipStageOptions;
  batchRunner?: SceneClipBatchRunner;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
  onClipCompleted?: (progress: { completedCount: number; totalCount: number }) => Promise<void> | void;
}): Promise<SceneClipStageResult> {
  const resolvedOptions = resolveSceneClipStageOptions(input.options);
  const scenes = includedRenderableScenes(input.project);
  if (scenes.length === 0) {
    throw new TourSceneClipRenderError(
      "Tour render needs at least one included scene for clip rendering.",
      "PROJECT_HAS_NO_INCLUDED_SCENES"
    );
  }

  const durationBySceneId = new Map(input.durations.map((duration) => [duration.sceneId, duration]));
  const handlePlanBySceneId = new Map(
    planSceneClipHandles({
      durations: input.durations,
      transitionSettings: resolvedOptions.sceneTransitions,
    }).map((plan) => [plan.sceneId, plan])
  );
  const totalCount = scenes.length;
  let completedCount = 0;
  const items = scenes.map((scene, index) => {
    const duration = durationBySceneId.get(scene.id);
    if (!duration) {
      throw new TourSceneClipRenderError(
        `Scene "${scene.title}" is missing a derived duration.`,
        "SCENE_DURATION_MISSING"
      );
    }
    const handlePlan = handlePlanBySceneId.get(scene.id);
    if (!handlePlan) {
      throw new TourSceneClipRenderError(
        `Scene "${scene.title}" is missing a transition handle plan.`,
        "SCENE_DURATION_MISSING"
      );
    }

    return {
      scene,
      index,
      duration,
      handlePlan,
      projectId: input.project.project.id,
      runId: input.runId,
      userId: input.userId,
      options: resolvedOptions,
    };
  });

  const indexedClips = input.batchRunner
    ? await input.batchRunner(items)
    : [];

  if (!input.batchRunner) {
    for (const item of items) {
      const clip = await renderSceneClipBatchItem({
        item,
        repository: input.repository,
        renderer: input.renderer,
        provider: input.provider,
        providerNormalizer: input.providerNormalizer,
        fetcher: input.fetcher,
        durationProbe: input.durationProbe,
        durationToleranceSeconds: input.durationToleranceSeconds,
      });
      completedCount += 1;
      await input.onClipCompleted?.({ completedCount, totalCount });
      indexedClips.push({ index: item.index, clip });
    }
  }

  if (input.batchRunner) {
    for (const _clip of indexedClips) {
      completedCount += 1;
      await input.onClipCompleted?.({ completedCount, totalCount });
    }
  }

  const clips = indexedClips
    .sort((a, b) => a.index - b.index)
    .map(({ clip }) => clip);

  return { clips, completedCount, totalCount };
}

export async function renderSceneClipBatchItem(input: {
  item: SceneClipBatchItem;
  repository: TourRenderRepository;
  renderer?: SceneClipRenderer;
  provider?: ImageToVideoProvider;
  providerNormalizer?: ProviderSceneClipNormalizer;
  fetcher?: typeof fetch;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
}): Promise<SceneClipStageClip> {
  return renderOrReuseSceneClip({
    scene: input.item.scene,
    duration: input.item.duration,
    handlePlan: input.item.handlePlan,
    projectId: input.item.projectId,
    repository: input.repository,
    runId: input.item.runId,
    userId: input.item.userId,
    renderer: input.renderer,
    provider: input.provider,
    providerNormalizer: input.providerNormalizer,
    fetcher: input.fetcher,
    durationProbe: input.durationProbe,
    durationToleranceSeconds: input.durationToleranceSeconds,
    options: input.item.options,
  });
}

async function renderOrReuseSceneClip(input: {
  scene: RenderableTourScene;
  duration: SceneDuration;
  handlePlan: SceneClipHandlePlan;
  projectId: string;
  repository: TourRenderRepository;
  runId: string;
  userId: string;
  renderer?: SceneClipRenderer;
  provider?: ImageToVideoProvider;
  providerNormalizer?: ProviderSceneClipNormalizer;
  fetcher?: typeof fetch;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
  options: ReturnType<typeof resolveSceneClipStageOptions>;
}): Promise<SceneClipStageClip> {
  const duration = input.duration;
  const handlePlan = input.handlePlan;
  const fingerprint = buildSceneClipFingerprint({
    scene: input.scene,
    durationSeconds: handlePlan.requestedDurationSeconds,
    handlePlan,
    sceneTransitions: input.options.sceneTransitions,
    renderMode: input.options.renderMode,
    providerModelId: input.options.providerModelId,
    includeSecondarySourceImages: input.options.includeSecondarySourceImages,
    renderSettings: input.options.renderSettings,
  });
  const fingerprintHash = hashSceneClipFingerprint(fingerprint);

  if (input.options.reuseExistingAssets) {
    const reusableAsset = await input.repository.findReusableAsset({
      projectId: input.projectId,
      kind: "scene_clip",
      fingerprintHash,
      sceneId: input.scene.id,
    });

    if (reusableAsset) {
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: reusableAsset.id,
        usage: "reused",
      });
      return {
        sceneId: input.scene.id,
        durationSeconds: duration.durationSeconds,
        asset: reusableAsset,
        reused: true,
        fingerprintHash,
        fingerprint,
        requestedDurationSeconds: handlePlan.requestedDurationSeconds,
        handlePlan,
      };
    }
  }

  const rendered =
    input.options.renderMode === "provider_image_to_video"
      ? await renderProviderSceneClip({
          scene: input.scene,
          durationSeconds: handlePlan.requestedDurationSeconds,
          targetDurationSeconds: duration.durationSeconds,
          repository: input.repository,
          provider: input.provider,
          normalizer: input.providerNormalizer ?? createFfmpegProviderSceneClipNormalizer(),
          fetcher: input.fetcher,
          userId: input.userId,
          projectId: input.projectId,
          runId: input.runId,
          modelId: input.options.providerModelId,
          settings: input.options.renderSettings,
          includeSecondarySourceImages: input.options.includeSecondarySourceImages,
          durationProbe: input.durationProbe,
          durationToleranceSeconds: input.durationToleranceSeconds,
        })
      : await renderKenBurnsSceneClip({
          scene: input.scene,
          durationSeconds: handlePlan.requestedDurationSeconds,
          repository: input.repository,
          renderer: input.renderer ?? createKenBurnsSceneClipRenderer(),
          runId: input.runId,
          settings: input.options.renderSettings,
        });

  const upload = await input.repository.uploadRenderAssetBytes({
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    kind: "scene_clip",
    content: rendered.content,
    contentType: rendered.contentType,
    extension: "mp4",
  });
  if (!upload) {
    throw new TourSceneClipRenderError(
      "Could not upload scene clip asset.",
      "SCENE_CLIP_UPLOAD_FAILED"
    );
  }

  const asset = await input.repository.createAsset({
    projectId: input.projectId,
    sceneId: input.scene.id,
    createdByRunId: input.runId,
    kind: "scene_clip",
    storageBucket: upload.storageBucket,
    storagePath: upload.storagePath,
    contentType: upload.contentType,
    fingerprintHash,
    fingerprint,
    reusable: true,
    metadata: {
      sceneId: input.scene.id,
      durationSeconds: duration.durationSeconds,
      requestedDurationSeconds: handlePlan.requestedDurationSeconds,
      renderMode: input.options.renderMode,
      transition: buildSceneClipTransitionFingerprint({
        transitionSettings: input.options.sceneTransitions,
        handlePlan,
      }),
      providerModelId:
        input.options.renderMode === "provider_image_to_video"
          ? input.options.providerModelId
          : null,
      ...(rendered.metadata ?? {}),
    },
  });
  if (!asset) {
    throw new TourSceneClipRenderError(
      "Could not create scene clip asset record.",
      "SCENE_CLIP_ASSET_CREATE_FAILED"
    );
  }

  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: asset.id,
    usage: "created",
  });

  return {
    sceneId: input.scene.id,
    durationSeconds: duration.durationSeconds,
    requestedDurationSeconds: handlePlan.requestedDurationSeconds,
    asset,
    reused: false,
    fingerprintHash,
    fingerprint,
    handlePlan,
  };
}

export function createKenBurnsSceneClipRenderer(): SceneClipRenderer {
  return {
    async renderSceneClip(input) {
      const cropFilter =
        input.settings.cropMode === "cover"
          ? `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=increase,crop=${input.settings.width}:${input.settings.height}`
          : `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=decrease,pad=${input.settings.width}:${input.settings.height}:(ow-iw)/2:(oh-ih)/2`;
      const zoomFilter = `${cropFilter},zoompan=z='min(zoom+0.0008,1.08)':d=${Math.max(1, Math.round(input.durationSeconds * input.settings.fps))}:s=${input.settings.width}x${input.settings.height}:fps=${input.settings.fps}`;
      await runProcess(input.ffmpegPath, [
        "-y",
        "-loop",
        "1",
        "-i",
        input.sourceImagePath,
        "-t",
        String(input.durationSeconds),
        "-vf",
        zoomFilter,
        "-r",
        String(input.settings.fps),
        "-c:v",
        "libx264",
        "-crf",
        String(input.settings.crf),
        "-pix_fmt",
        "yuv420p",
        input.outputVideoPath,
      ]);

      await runProcess(input.ffprobePath, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input.outputVideoPath,
      ]);

      return {
        metadata: {
          renderer: "ken_burns_ffmpeg",
          ffmpegPath: input.ffmpegPath,
          ffprobePath: input.ffprobePath,
        },
      };
    },
  };
}

export function createFfmpegProviderSceneClipNormalizer(): ProviderSceneClipNormalizer {
  return {
    async normalizeSceneClip(input) {
      await runProcess(input.ffmpegPath, [
        "-y",
        "-i",
        input.inputVideoPath,
        "-vf",
        `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=increase,crop=${input.settings.width}:${input.settings.height},setsar=1,fps=${input.settings.fps},setpts=PTS-STARTPTS`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        String(input.settings.crf),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        input.outputVideoPath,
      ]);

      return {
        metadata: {
          normalizer: "ffmpeg_provider_clip_normalizer",
          ffmpegPath: input.ffmpegPath,
        },
      };
    },
  };
}

async function renderKenBurnsSceneClip(input: {
  scene: RenderableTourScene;
  durationSeconds: number;
  repository: TourRenderRepository;
  renderer: SceneClipRenderer;
  runId: string;
  settings: ResolvedSceneClipRenderSettings;
}): Promise<{ content: Buffer; contentType: string; metadata?: Record<string, unknown> }> {
  const scratchDir = path.join(tmpdir(), "aim-tours-render", input.runId, "scene-clips", input.scene.id);
  const sourceImagePath = path.join(scratchDir, input.scene.authoritativePhoto.fileName);
  const outputVideoPath = path.join(scratchDir, `${input.scene.id}.mp4`);

  try {
    await mkdir(scratchDir, { recursive: true });
    const sourcePhoto = await input.repository.downloadListingMedia({
      storagePath: input.scene.authoritativePhoto.storagePath,
    });
    if (!sourcePhoto) {
      throw new TourSceneClipRenderError(
        `Could not download source photo for scene "${input.scene.title}".`,
        "SOURCE_PHOTO_DOWNLOAD_FAILED"
      );
    }

    await writeFile(sourceImagePath, sourcePhoto);
    const rendered = await input.renderer.renderSceneClip({
      scene: input.scene,
      sourceImagePath,
      outputVideoPath,
      durationSeconds: input.durationSeconds,
      settings: input.settings,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
    });

    return {
      content: await readFile(outputVideoPath),
      contentType: "video/mp4",
      metadata: rendered.metadata,
    };
  } catch (error) {
    if (error instanceof TourSceneClipRenderError) {
      throw error;
    }
    throw new TourSceneClipRenderError(
      "Scene clip rendering failed.",
      "SCENE_CLIP_RENDER_FAILED"
    );
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

async function renderProviderSceneClip(input: {
  scene: RenderableTourScene;
  durationSeconds: number;
  targetDurationSeconds: number;
  repository: TourRenderRepository;
  provider?: ImageToVideoProvider;
  normalizer: ProviderSceneClipNormalizer;
  fetcher?: typeof fetch;
  userId: string;
  projectId: string;
  runId: string;
  modelId: string;
  settings: ResolvedSceneClipRenderSettings;
  includeSecondarySourceImages: boolean;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
}): Promise<{ content: Buffer; contentType: string; metadata?: Record<string, unknown> }> {
  if (!input.provider) {
    throw new TourSceneClipRenderError(
      "Image-to-video provider is not configured for scene clip rendering.",
      "SCENE_CLIP_PROVIDER_FAILED"
    );
  }

  const secondarySourcePhotos = input.includeSecondarySourceImages
    ? getSecondarySourcePhotos(input.scene)
    : [];
  const signedSourcePhotoUrls = await input.repository.createSignedSourcePhotoUrls({
    storagePaths: [
      input.scene.authoritativePhoto.storagePath,
      ...secondarySourcePhotos.map((photo) => photo.storagePath),
    ],
    expiresInSeconds: 10 * 60,
  });
  const signedUrlByStoragePath = new Map(
    signedSourcePhotoUrls.map((sourceUrl) => [sourceUrl.storagePath, sourceUrl.signedUrl])
  );
  const sourceImageUrl = signedUrlByStoragePath.get(input.scene.authoritativePhoto.storagePath);
  if (!sourceImageUrl) {
    throw new TourSceneClipRenderError(
      "Could not create a signed source photo URL for image-to-video rendering.",
      "SIGNED_SOURCE_PHOTO_URL_MISSING"
    );
  }
  const secondarySourceImageUrls = secondarySourcePhotos
    .map((photo) => signedUrlByStoragePath.get(photo.storagePath))
    .filter((url): url is string => Boolean(url));

  const rendered = await input.provider.renderSceneClip({
    scene: input.scene,
    sourceImageUrl,
    secondarySourceImageUrls,
    durationSeconds: input.durationSeconds,
    modelId: input.modelId,
    settings: input.settings,
  });

  console.log("Importing image-to-video provider output.", {
    sceneId: input.scene.id,
    sceneTitle: input.scene.title,
    outputUrlHost: safeUrlHost(rendered.outputUrl),
    hasDownloadHeaders: Boolean(rendered.downloadHeaders),
  });

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(rendered.outputUrl, {
      headers: rendered.downloadHeaders,
    });
  } catch (error) {
    console.error("Image-to-video provider output import threw.", {
      sceneId: input.scene.id,
      sceneTitle: input.scene.title,
      outputUrlHost: safeUrlHost(rendered.outputUrl),
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new TourSceneClipRenderError(
      "Could not import image-to-video provider output.",
      "SCENE_CLIP_PROVIDER_OUTPUT_IMPORT_FAILED"
    );
  }
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error("Image-to-video provider output import failed.", {
      sceneId: input.scene.id,
      sceneTitle: input.scene.title,
      outputUrlHost: safeUrlHost(rendered.outputUrl),
      status: response.status,
      contentType: response.headers.get("content-type"),
      responseText: truncateForLog(responseText),
    });
    throw new TourSceneClipRenderError(
      "Could not import image-to-video provider output.",
      "SCENE_CLIP_PROVIDER_OUTPUT_IMPORT_FAILED"
    );
  }

  const providerContentType = rendered.contentType ?? response.headers.get("content-type") ?? "video/mp4";
  const providerContent = Buffer.from(await response.arrayBuffer());
  const normalized = await normalizeProviderSceneClip({
    scene: input.scene,
    runId: input.runId,
    content: providerContent,
    contentType: providerContentType,
    settings: input.settings,
    normalizer: input.normalizer,
    expectedDurationSeconds: input.durationSeconds,
    durationProbe: input.durationProbe,
    durationToleranceSeconds: input.durationToleranceSeconds,
  });

  return {
    content: normalized.content,
    contentType: "video/mp4",
    metadata: {
      provider: "openrouter",
      modelId: input.modelId,
      providerOutputContentType: providerContentType,
      normalizedProviderOutput: true,
      targetDurationSeconds: input.targetDurationSeconds,
      requestedDurationSeconds: input.durationSeconds,
      ...(rendered.metadata ?? {}),
      ...(normalized.metadata ?? {}),
    },
  };
}

async function normalizeProviderSceneClip(input: {
  scene: RenderableTourScene;
  runId: string;
  content: Buffer;
  contentType: string;
  settings: ResolvedSceneClipRenderSettings;
  normalizer: ProviderSceneClipNormalizer;
  expectedDurationSeconds: number;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
}): Promise<{ content: Buffer; metadata?: Record<string, unknown> }> {
  const scratchDir = path.join(
    tmpdir(),
    "aim-tours-render",
    input.runId,
    "provider-scene-clips",
    input.scene.id
  );
  const inputVideoPath = path.join(scratchDir, `provider-output${extensionForContentType(input.contentType)}`);
  const outputVideoPath = path.join(scratchDir, `${input.scene.id}-normalized.mp4`);

  try {
    await mkdir(scratchDir, { recursive: true });
    await writeFile(inputVideoPath, input.content);
    const normalized = await input.normalizer.normalizeSceneClip({
      inputVideoPath,
      outputVideoPath,
      settings: input.settings,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
    });
    let actualDurationSeconds: number;
    try {
      actualDurationSeconds = await (input.durationProbe ?? probeVideoDurationSeconds)(
        outputVideoPath
      );
      assertVideoDurationAtLeast({
        actualSeconds: actualDurationSeconds,
        expectedSeconds: input.expectedDurationSeconds,
        toleranceSeconds: input.durationToleranceSeconds,
        label: `Scene ${input.scene.id} normalized provider clip`,
      });
    } catch (error) {
      throw new TourSceneClipRenderError(
        error instanceof Error
          ? error.message
          : "Image-to-video provider output duration could not be validated.",
        "SCENE_CLIP_DURATION_INVALID"
      );
    }

    return {
      content: await readFile(outputVideoPath),
      metadata: {
        ...(normalized.metadata ?? {}),
        actualDurationSeconds,
      },
    };
  } catch (error) {
    if (error instanceof TourSceneClipRenderError) {
      throw error;
    }
    throw new TourSceneClipRenderError(
      "Image-to-video provider output normalization failed.",
      "SCENE_CLIP_RENDER_FAILED"
    );
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("quicktime")) return ".mov";
  return ".mp4";
}

function includedRenderableScenes(project: RenderableTourProject): RenderableTourScene[] {
  return project.scenes
    .filter((scene) => scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function getSecondarySourcePhotos(scene: RenderableTourScene): RenderableTourSceneSourcePhoto[] {
  return scene.sourcePhotos.filter((photo) => photo.id !== scene.authoritativePhoto.id);
}

function truncateForLog(value: string, maxLength = 1200): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeUrlHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

async function runProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}
