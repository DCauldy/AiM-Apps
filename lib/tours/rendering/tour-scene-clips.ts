import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getTourSceneCameraMotionLabel } from "@/lib/tours/scenes.core";
import type {
  RenderableTourProject,
  RenderableTourScene,
  TourRenderAsset,
  TourRenderRepository,
} from "./tour-render.repository";
import type { SceneDuration } from "./tour-transitions";
import { getDefaultTourRenderMode, type TourRenderMode } from "./tour-render-preflight";

export const KEN_BURNS_SCENE_CLIP_RENDERER_VERSION = "ken-burns-ffmpeg-v1";
export const PROVIDER_SCENE_CLIP_RENDERER_VERSION = "provider-image-to-video-v1";
export const DEFAULT_SCENE_CLIP_PROVIDER_MODEL = "kwaivgi/kling-v3.0-std";

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
  renderSettings?: SceneClipRenderSettings;
  concurrencyLimit?: number;
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

type OpenRouterVideoJob = {
  id?: string;
  status?: string;
  polling_url?: string;
  error?: string;
  unsigned_urls?: string[];
};

export type SceneClipStageResult = {
  clips: Array<{
    sceneId: string;
    durationSeconds: number;
    asset: TourRenderAsset;
    reused: boolean;
    fingerprintHash: string;
    fingerprint: SceneClipFingerprint;
  }>;
  completedCount: number;
  totalCount: number;
};

export type SceneClipStageClip = SceneClipStageResult["clips"][number];

export type SceneClipBatchItem = {
  index: number;
  scene: RenderableTourScene;
  duration: SceneDuration;
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
  durationSeconds: number;
  renderSettings: ResolvedSceneClipRenderSettings;
};

export class TourSceneClipRenderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROJECT_HAS_NO_INCLUDED_SCENES"
      | "SCENE_DURATION_MISSING"
      | "SOURCE_PHOTO_DOWNLOAD_FAILED"
      | "SIGNED_SOURCE_PHOTO_URL_MISSING"
      | "SCENE_CLIP_RENDER_FAILED"
      | "SCENE_CLIP_PROVIDER_FAILED"
      | "SCENE_CLIP_PROVIDER_OUTPUT_IMPORT_FAILED"
      | "SCENE_CLIP_UPLOAD_FAILED"
      | "SCENE_CLIP_ASSET_CREATE_FAILED"
  ) {
    super(message);
    this.name = "TourSceneClipRenderError";
  }
}

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
  renderSettings: ResolvedSceneClipRenderSettings;
  concurrencyLimit: number;
} {
  return {
    renderMode: options.renderMode ?? getDefaultTourRenderMode(),
    reuseExistingAssets: options.reuseExistingAssets !== false,
    providerModelId: options.providerModelId ?? DEFAULT_SCENE_CLIP_PROVIDER_MODEL,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(options.renderSettings ?? {}),
    },
    concurrencyLimit: normalizeConcurrencyLimit(options.concurrencyLimit),
  };
}

export function buildSceneClipFingerprint(input: {
  scene: RenderableTourScene;
  durationSeconds: number;
  renderMode: TourRenderMode;
  providerModelId: string;
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
    durationSeconds: input.durationSeconds,
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
  fetcher?: typeof fetch;
  options?: SceneClipStageOptions;
  batchRunner?: SceneClipBatchRunner;
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

    return {
      scene,
      index,
      duration,
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
        fetcher: input.fetcher,
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
  fetcher?: typeof fetch;
}): Promise<SceneClipStageClip> {
  return renderOrReuseSceneClip({
    scene: input.item.scene,
    duration: input.item.duration,
    projectId: input.item.projectId,
    repository: input.repository,
    runId: input.item.runId,
    userId: input.item.userId,
    renderer: input.renderer,
    provider: input.provider,
    fetcher: input.fetcher,
    options: input.item.options,
  });
}

async function renderOrReuseSceneClip(input: {
  scene: RenderableTourScene;
  duration: SceneDuration;
  projectId: string;
  repository: TourRenderRepository;
  runId: string;
  userId: string;
  renderer?: SceneClipRenderer;
  provider?: ImageToVideoProvider;
  fetcher?: typeof fetch;
  options: ReturnType<typeof resolveSceneClipStageOptions>;
}): Promise<SceneClipStageClip> {
  const duration = input.duration;
  const fingerprint = buildSceneClipFingerprint({
    scene: input.scene,
    durationSeconds: duration.durationSeconds,
    renderMode: input.options.renderMode,
    providerModelId: input.options.providerModelId,
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
      };
    }
  }

  const rendered =
    input.options.renderMode === "provider_image_to_video"
      ? await renderProviderSceneClip({
          scene: input.scene,
          durationSeconds: duration.durationSeconds,
          repository: input.repository,
          provider: input.provider,
          fetcher: input.fetcher,
          userId: input.userId,
          projectId: input.projectId,
          runId: input.runId,
          modelId: input.options.providerModelId,
          settings: input.options.renderSettings,
        })
      : await renderKenBurnsSceneClip({
          scene: input.scene,
          durationSeconds: duration.durationSeconds,
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
      renderMode: input.options.renderMode,
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
    asset,
    reused: false,
    fingerprintHash,
    fingerprint,
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

export function createOpenRouterImageToVideoProvider(options: {
  apiKey: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): ImageToVideoProvider {
  const fetcher = options.fetcher ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 20_000;
  const maxPollAttempts = options.maxPollAttempts ?? 90;

  return {
    async renderSceneClip(input) {
      if (!options.apiKey) {
        throw new TourSceneClipRenderError(
          "OpenRouter API key is required for image-to-video rendering.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      const prompt = buildOpenRouterSceneClipPrompt(input);
      const providerDurationSeconds = normalizeOpenRouterVideoDuration(input.durationSeconds);
      console.log("OpenRouter image-to-video submit started.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        durationSeconds: input.durationSeconds,
        providerDurationSeconds,
      });

      let submitResponse: Response;
      try {
        submitResponse = await fetcher("https://openrouter.ai/api/v1/videos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.modelId,
            prompt,
            duration: providerDurationSeconds,
            resolution: "720p",
            aspect_ratio: "9:16",
            generate_audio: false,
            frame_images: [
              {
                type: "image_url",
                image_url: { url: input.sourceImageUrl },
                frame_type: "first_frame",
              },
            ],
          }),
        });
      } catch (error) {
        console.error("OpenRouter image-to-video submit threw.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video request failed.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      if (!submitResponse.ok) {
        const responseText = await submitResponse.text().catch(() => "");
        console.error("OpenRouter image-to-video submit failed.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          status: submitResponse.status,
          responseText: truncateForLog(responseText),
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video request failed.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      const submitted = await submitResponse.json().catch(() => null) as OpenRouterVideoJob | null;
      console.log("OpenRouter image-to-video submit accepted.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        providerJobId: submitted?.id ?? null,
        status: submitted?.status ?? null,
      });
      const completed = await waitForOpenRouterVideoJob({
        job: submitted,
        apiKey: options.apiKey,
        fetcher,
        pollIntervalMs,
        maxPollAttempts,
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
      });
      const outputUrl = completed.unsigned_urls?.[0] ?? null;

      if (!outputUrl) {
        console.error("OpenRouter image-to-video completed without unsigned output URL.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          providerJobId: completed.id ?? null,
          status: completed.status ?? null,
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video response did not include an unsigned output URL.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      console.log("OpenRouter image-to-video completed.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        providerJobId: completed.id ?? null,
        outputUrlHost: safeUrlHost(outputUrl),
      });

      return {
        outputUrl,
        downloadHeaders: outputUrl.startsWith("https://openrouter.ai/api/")
          ? { Authorization: `Bearer ${options.apiKey}` }
          : undefined,
        metadata: {
          providerJobId: completed.id ?? null,
          prompt,
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
  repository: TourRenderRepository;
  provider?: ImageToVideoProvider;
  fetcher?: typeof fetch;
  userId: string;
  projectId: string;
  runId: string;
  modelId: string;
  settings: ResolvedSceneClipRenderSettings;
}): Promise<{ content: Buffer; contentType: string; metadata?: Record<string, unknown> }> {
  if (!input.provider) {
    throw new TourSceneClipRenderError(
      "Image-to-video provider is not configured for scene clip rendering.",
      "SCENE_CLIP_PROVIDER_FAILED"
    );
  }

  const [sourceUrl] = await input.repository.createSignedSourcePhotoUrls({
    storagePaths: [input.scene.authoritativePhoto.storagePath],
    expiresInSeconds: 10 * 60,
  });
  if (!sourceUrl?.signedUrl) {
    throw new TourSceneClipRenderError(
      "Could not create a signed source photo URL for image-to-video rendering.",
      "SIGNED_SOURCE_PHOTO_URL_MISSING"
    );
  }

  const rendered = await input.provider.renderSceneClip({
    scene: input.scene,
    sourceImageUrl: sourceUrl.signedUrl,
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

  return {
    content: Buffer.from(await response.arrayBuffer()),
    contentType: rendered.contentType ?? response.headers.get("content-type") ?? "video/mp4",
    metadata: {
      provider: "openrouter",
      modelId: input.modelId,
      ...(rendered.metadata ?? {}),
    },
  };
}

function includedRenderableScenes(project: RenderableTourProject): RenderableTourScene[] {
  return project.scenes
    .filter((scene) => scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function buildOpenRouterSceneClipPrompt(input: ImageToVideoProviderInput): string {
  const cameraMotion =
    input.scene.cameraMotion === "auto"
      ? "Choose the strongest camera motion for an Instagram real-estate hook based on this image"
      : getTourSceneCameraMotionLabel(input.scene.cameraMotion);

  return [
    cameraMotion,
    `through ${input.scene.title}.`,
    "Preserve all visible property details exactly.",
    "Do not add or remove rooms, fixtures, doors, windows, openings, light sources, or architectural details.",
  ].join(" ");
}

function normalizeOpenRouterVideoDuration(durationSeconds: number): number {
  const rounded = Math.round(durationSeconds);
  if (!Number.isFinite(rounded)) {
    return 5;
  }
  return Math.max(1, rounded);
}

async function waitForOpenRouterVideoJob(input: {
  job: OpenRouterVideoJob | null;
  apiKey: string;
  fetcher: typeof fetch;
  pollIntervalMs: number;
  maxPollAttempts: number;
  sceneId: string;
  sceneTitle: string;
  modelId: string;
}): Promise<OpenRouterVideoJob> {
  let current = input.job;
  for (let attempt = 0; attempt <= input.maxPollAttempts; attempt += 1) {
    console.log("OpenRouter image-to-video poll status.", {
      sceneId: input.sceneId,
      sceneTitle: input.sceneTitle,
      modelId: input.modelId,
      providerJobId: current?.id ?? null,
      status: current?.status ?? null,
      attempt,
      maxPollAttempts: input.maxPollAttempts,
    });
    if (current?.status === "completed") {
      return current;
    }
    if (current?.status && ["failed", "cancelled", "expired"].includes(current.status)) {
      console.error("OpenRouter image-to-video terminal failure.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        status: current.status,
        error: current.error ?? null,
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video generation failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (!current?.id && !current?.polling_url) {
      console.error("OpenRouter image-to-video job missing poll target.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        status: current?.status ?? null,
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video response did not include a job id.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (attempt === input.maxPollAttempts) {
      break;
    }

    await sleep(input.pollIntervalMs);
    const pollingUrl = new URL(
      current.polling_url ?? `/api/v1/videos/${encodeURIComponent(current.id ?? "")}`,
      "https://openrouter.ai"
    );
    let response: Response;
    try {
      response = await input.fetcher(pollingUrl, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
      });
    } catch (error) {
      console.error("OpenRouter image-to-video poll threw.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video polling failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error("OpenRouter image-to-video poll failed.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        status: response.status,
        responseText: truncateForLog(responseText),
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video polling failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    current = await response.json().catch(() => null) as OpenRouterVideoJob | null;
  }

  throw new TourSceneClipRenderError(
    "OpenRouter image-to-video generation timed out.",
    "SCENE_CLIP_PROVIDER_FAILED"
  );
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

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
