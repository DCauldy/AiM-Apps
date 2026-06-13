import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  RenderableTourProject,
  RenderableTourScene,
  TourRenderAsset,
  TourRenderRepository,
} from "./tour-render.repository";
import type { SceneDuration } from "./tour-transitions";
import type { TourRenderMode } from "./tour-render-preflight";

export const KEN_BURNS_SCENE_CLIP_RENDERER_VERSION = "ken-burns-ffmpeg-v1";
export const PROVIDER_SCENE_CLIP_RENDERER_VERSION = "provider-image-to-video-v1";
export const DEFAULT_SCENE_CLIP_PROVIDER_MODEL = "fal-ai/kling-video/v1/standard/image-to-video";

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
    contentType?: string;
    metadata?: Record<string, unknown>;
  }>;
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

export function resolveSceneClipStageOptions(
  options: SceneClipStageOptions = {}
): {
  renderMode: TourRenderMode;
  reuseExistingAssets: boolean;
  providerModelId: string;
  renderSettings: ResolvedSceneClipRenderSettings;
} {
  return {
    renderMode: options.renderMode ?? "ken_burns_ffmpeg",
    reuseExistingAssets: options.reuseExistingAssets !== false,
    providerModelId: options.providerModelId ?? DEFAULT_SCENE_CLIP_PROVIDER_MODEL,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(options.renderSettings ?? {}),
    },
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
  const clips: SceneClipStageResult["clips"] = [];

  for (const scene of scenes) {
    const duration = durationBySceneId.get(scene.id);
    if (!duration) {
      throw new TourSceneClipRenderError(
        `Scene "${scene.title}" is missing a derived duration.`,
        "SCENE_DURATION_MISSING"
      );
    }

    const fingerprint = buildSceneClipFingerprint({
      scene,
      durationSeconds: duration.durationSeconds,
      renderMode: resolvedOptions.renderMode,
      providerModelId: resolvedOptions.providerModelId,
      renderSettings: resolvedOptions.renderSettings,
    });
    const fingerprintHash = hashSceneClipFingerprint(fingerprint);

    if (resolvedOptions.reuseExistingAssets) {
      const reusableAsset = await input.repository.findReusableAsset({
        projectId: input.project.project.id,
        kind: "scene_clip",
        fingerprintHash,
        sceneId: scene.id,
      });

      if (reusableAsset) {
        await input.repository.recordRunAssetUsage({
          runId: input.runId,
          assetId: reusableAsset.id,
          usage: "reused",
        });
        completedCount += 1;
        await input.onClipCompleted?.({ completedCount, totalCount });
        clips.push({
          sceneId: scene.id,
          durationSeconds: duration.durationSeconds,
          asset: reusableAsset,
          reused: true,
          fingerprintHash,
          fingerprint,
        });
        continue;
      }
    }

    const rendered =
      resolvedOptions.renderMode === "provider_image_to_video"
        ? await renderProviderSceneClip({
            scene,
            durationSeconds: duration.durationSeconds,
            repository: input.repository,
            provider: input.provider,
            fetcher: input.fetcher,
            userId: input.userId,
            projectId: input.project.project.id,
            runId: input.runId,
            modelId: resolvedOptions.providerModelId,
            settings: resolvedOptions.renderSettings,
          })
        : await renderKenBurnsSceneClip({
            scene,
            durationSeconds: duration.durationSeconds,
            repository: input.repository,
            renderer: input.renderer ?? createKenBurnsSceneClipRenderer(),
            runId: input.runId,
            settings: resolvedOptions.renderSettings,
          });

    const upload = await input.repository.uploadRenderAssetBytes({
      userId: input.userId,
      projectId: input.project.project.id,
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
      projectId: input.project.project.id,
      sceneId: scene.id,
      createdByRunId: input.runId,
      kind: "scene_clip",
      storageBucket: upload.storageBucket,
      storagePath: upload.storagePath,
      contentType: upload.contentType,
      fingerprintHash,
      fingerprint,
      reusable: true,
      metadata: {
        sceneId: scene.id,
        durationSeconds: duration.durationSeconds,
        renderMode: resolvedOptions.renderMode,
        providerModelId:
          resolvedOptions.renderMode === "provider_image_to_video"
            ? resolvedOptions.providerModelId
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
    completedCount += 1;
    await input.onClipCompleted?.({ completedCount, totalCount });
    clips.push({
      sceneId: scene.id,
      durationSeconds: duration.durationSeconds,
      asset,
      reused: false,
      fingerprintHash,
      fingerprint,
    });
  }

  return { clips, completedCount, totalCount };
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

  const response = await (input.fetcher ?? fetch)(rendered.outputUrl);
  if (!response.ok) {
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
