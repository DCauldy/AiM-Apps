import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TourRenderAsset, TourRenderRepository } from "./tour-render.repository";

export const FINAL_RENDERER_VERSION = "ffmpeg-final-render-v1";

export type FinalRenderSettings = {
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  preset?: string;
  crf?: number;
  audioBitrate?: string;
};

export type ResolvedFinalRenderSettings = Required<FinalRenderSettings>;

export type FinalRenderStageOptions = {
  concatSettings?: {
    safe?: 0 | 1;
    copyCodec?: boolean;
  };
  muxSettings?: FinalRenderSettings;
  outputPreset?: "vertical_1080p_h264_aac";
};

export type FinalRenderSceneClip = {
  sceneId: string;
  asset: TourRenderAsset;
  fingerprintHash: string;
};

export type JoinedScenesFingerprint = {
  kind: "joined_scenes";
  version: 1;
  rendererVersion: string;
  orderedClips: Array<{
    sceneId: string;
    assetId: string;
    fingerprintHash: string;
  }>;
  concatSettings: {
    safe: 0 | 1;
    copyCodec: boolean;
  };
};

export type FinalVideoFingerprint = {
  kind: "final_video";
  version: 1;
  rendererVersion: string;
  joinedScenesFingerprintHash: string;
  voiceover:
    | {
        assetId: string;
        fingerprintHash: string;
      }
    | null;
  muxSettings: ResolvedFinalRenderSettings;
  outputPreset: "vertical_1080p_h264_aac";
  avatarOverlay: null;
};

export type FinalVideoRendererInput = {
  concatFilePath: string;
  sceneClipPaths: string[];
  joinedScenesPath: string;
  finalVideoPath: string;
  voiceoverAudioPath?: string;
  settings: ResolvedFinalRenderSettings;
  ffmpegPath: string;
};

export type FinalVideoRenderer = {
  joinSceneClips(input: FinalVideoRendererInput): Promise<{ metadata?: Record<string, unknown> }>;
  muxFinalVideo(input: FinalVideoRendererInput): Promise<{ metadata?: Record<string, unknown> }>;
};

export type FinalRenderStageResult = {
  joinedScenesAsset: TourRenderAsset;
  finalVideoAsset: TourRenderAsset;
  joinedScenesFingerprint: JoinedScenesFingerprint;
  joinedScenesFingerprintHash: string;
  finalVideoFingerprint: FinalVideoFingerprint;
  finalVideoFingerprintHash: string;
};

export class TourFinalRenderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NO_SCENE_CLIPS"
      | "SCENE_CLIP_STORAGE_MISSING"
      | "SCENE_CLIP_DOWNLOAD_FAILED"
      | "VOICEOVER_STORAGE_MISSING"
      | "VOICEOVER_DOWNLOAD_FAILED"
      | "CONCAT_FAILED"
      | "MUX_FAILED"
      | "JOINED_SCENES_UPLOAD_FAILED"
      | "JOINED_SCENES_ASSET_CREATE_FAILED"
      | "FINAL_VIDEO_UPLOAD_FAILED"
      | "FINAL_VIDEO_ASSET_CREATE_FAILED"
  ) {
    super(message);
    this.name = "TourFinalRenderError";
  }
}

const DEFAULT_FINAL_RENDER_SETTINGS: ResolvedFinalRenderSettings = {
  width: 1080,
  height: 1920,
  videoCodec: "libx264",
  audioCodec: "aac",
  preset: "medium",
  crf: 20,
  audioBitrate: "192k",
};

export function resolveFinalRenderStageOptions(options: FinalRenderStageOptions = {}) {
  return {
    concatSettings: {
      safe: options.concatSettings?.safe ?? 0,
      copyCodec: options.concatSettings?.copyCodec ?? true,
    },
    muxSettings: {
      ...DEFAULT_FINAL_RENDER_SETTINGS,
      ...(options.muxSettings ?? {}),
    },
    outputPreset: options.outputPreset ?? "vertical_1080p_h264_aac",
  } as const;
}

export function buildJoinedScenesFingerprint(input: {
  clips: FinalRenderSceneClip[];
  concatSettings: JoinedScenesFingerprint["concatSettings"];
}): JoinedScenesFingerprint {
  return {
    kind: "joined_scenes",
    version: 1,
    rendererVersion: FINAL_RENDERER_VERSION,
    orderedClips: input.clips.map((clip) => ({
      sceneId: clip.sceneId,
      assetId: clip.asset.id,
      fingerprintHash: clip.fingerprintHash,
    })),
    concatSettings: input.concatSettings,
  };
}

export function buildFinalVideoFingerprint(input: {
  joinedScenesFingerprintHash: string;
  voiceoverAsset?: TourRenderAsset | null;
  muxSettings: ResolvedFinalRenderSettings;
  outputPreset: FinalVideoFingerprint["outputPreset"];
}): FinalVideoFingerprint {
  return {
    kind: "final_video",
    version: 1,
    rendererVersion: FINAL_RENDERER_VERSION,
    joinedScenesFingerprintHash: input.joinedScenesFingerprintHash,
    voiceover: input.voiceoverAsset
      ? {
          assetId: input.voiceoverAsset.id,
          fingerprintHash: input.voiceoverAsset.fingerprintHash,
        }
      : null,
    muxSettings: input.muxSettings,
    outputPreset: input.outputPreset,
    avatarOverlay: null,
  };
}

export function hashFinalRenderFingerprint(
  fingerprint: JoinedScenesFingerprint | FinalVideoFingerprint
): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export async function renderFinalVideoStage(input: {
  projectId: string;
  userId: string;
  runId: string;
  repository: TourRenderRepository;
  clips: FinalRenderSceneClip[];
  voiceoverAsset?: TourRenderAsset | null;
  renderer?: FinalVideoRenderer;
  options?: FinalRenderStageOptions;
}): Promise<FinalRenderStageResult> {
  if (input.clips.length === 0) {
    throw new TourFinalRenderError("Final render needs at least one scene clip.", "NO_SCENE_CLIPS");
  }

  const resolvedOptions = resolveFinalRenderStageOptions(input.options);
  const joinedScenesFingerprint = buildJoinedScenesFingerprint({
    clips: input.clips,
    concatSettings: resolvedOptions.concatSettings,
  });
  const joinedScenesFingerprintHash = hashFinalRenderFingerprint(joinedScenesFingerprint);
  const finalVideoFingerprint = buildFinalVideoFingerprint({
    joinedScenesFingerprintHash,
    voiceoverAsset: input.voiceoverAsset,
    muxSettings: resolvedOptions.muxSettings,
    outputPreset: resolvedOptions.outputPreset,
  });
  const finalVideoFingerprintHash = hashFinalRenderFingerprint(finalVideoFingerprint);

  const scratchDir = path.join(tmpdir(), "aim-tours-render", input.runId, "final-render");
  const joinedScenesPath = path.join(scratchDir, "joined-scenes.mp4");
  const finalVideoPath = path.join(scratchDir, "final-video.mp4");
  const concatFilePath = path.join(scratchDir, "clips.txt");
  const renderer = input.renderer ?? createFfmpegFinalVideoRenderer();

  try {
    await mkdir(scratchDir, { recursive: true });
    const sceneClipPaths = await writeSceneClipsToScratch({
      repository: input.repository,
      clips: input.clips,
      scratchDir,
    });
    const voiceoverAudioPath = input.voiceoverAsset
      ? await writeVoiceoverToScratch({
          repository: input.repository,
          voiceoverAsset: input.voiceoverAsset,
          scratchDir,
        })
      : undefined;

    await writeFile(
      concatFilePath,
      `${sceneClipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n")}\n`
    );

    let joined: { metadata?: Record<string, unknown> };
    try {
      joined = await renderer.joinSceneClips({
        concatFilePath,
        sceneClipPaths,
        joinedScenesPath,
        finalVideoPath,
        voiceoverAudioPath,
        settings: resolvedOptions.muxSettings,
        ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      });
    } catch {
      throw new TourFinalRenderError("Scene clip concat failed.", "CONCAT_FAILED");
    }

    const joinedUpload = await input.repository.uploadRenderAssetBytes({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "joined_scenes",
      content: await readFile(joinedScenesPath),
      contentType: "video/mp4",
      extension: "mp4",
    });
    if (!joinedUpload) {
      throw new TourFinalRenderError(
        "Could not upload joined scene video.",
        "JOINED_SCENES_UPLOAD_FAILED"
      );
    }

    const joinedScenesAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "joined_scenes",
      storageBucket: joinedUpload.storageBucket,
      storagePath: joinedUpload.storagePath,
      contentType: joinedUpload.contentType,
      fingerprintHash: joinedScenesFingerprintHash,
      fingerprint: joinedScenesFingerprint,
      reusable: true,
      metadata: {
        sceneClipAssetIds: input.clips.map((clip) => clip.asset.id),
        ...(joined.metadata ?? {}),
      },
    });
    if (!joinedScenesAsset) {
      throw new TourFinalRenderError(
        "Could not create joined scene asset record.",
        "JOINED_SCENES_ASSET_CREATE_FAILED"
      );
    }

    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: joinedScenesAsset.id,
      usage: "created",
    });

    let final: { metadata?: Record<string, unknown> };
    try {
      final = await renderer.muxFinalVideo({
        concatFilePath,
        sceneClipPaths,
        joinedScenesPath,
        finalVideoPath,
        voiceoverAudioPath,
        settings: resolvedOptions.muxSettings,
        ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      });
    } catch {
      throw new TourFinalRenderError("Final video mux failed.", "MUX_FAILED");
    }

    const finalUpload = await input.repository.uploadRenderAssetBytes({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "final_video",
      content: await readFile(finalVideoPath),
      contentType: "video/mp4",
      extension: "mp4",
    });
    if (!finalUpload) {
      throw new TourFinalRenderError(
        "Could not upload final video.",
        "FINAL_VIDEO_UPLOAD_FAILED"
      );
    }

    const finalVideoAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "final_video",
      storageBucket: finalUpload.storageBucket,
      storagePath: finalUpload.storagePath,
      contentType: finalUpload.contentType,
      fingerprintHash: finalVideoFingerprintHash,
      fingerprint: finalVideoFingerprint,
      reusable: true,
      metadata: {
        joinedScenesAssetId: joinedScenesAsset.id,
        voiceoverAssetId: input.voiceoverAsset?.id ?? null,
        outputPreset: resolvedOptions.outputPreset,
        avatarOverlay: null,
        ...(final.metadata ?? {}),
      },
    });
    if (!finalVideoAsset) {
      throw new TourFinalRenderError(
        "Could not create final video asset record.",
        "FINAL_VIDEO_ASSET_CREATE_FAILED"
      );
    }

    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: finalVideoAsset.id,
      usage: "result",
    });

    return {
      joinedScenesAsset,
      finalVideoAsset,
      joinedScenesFingerprint,
      joinedScenesFingerprintHash,
      finalVideoFingerprint,
      finalVideoFingerprintHash,
    };
  } catch (error) {
    if (error instanceof TourFinalRenderError) {
      throw error;
    }
    throw new TourFinalRenderError("Final video mux failed.", "MUX_FAILED");
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

export function createFfmpegFinalVideoRenderer(): FinalVideoRenderer {
  return {
    async joinSceneClips(input) {
      await runProcess(input.ffmpegPath, [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        input.concatFilePath,
        "-c",
        "copy",
        input.joinedScenesPath,
      ]);
      return { metadata: { renderer: "ffmpeg_concat" } };
    },

    async muxFinalVideo(input) {
      const args = input.voiceoverAudioPath
        ? [
            "-y",
            "-i",
            input.joinedScenesPath,
            "-i",
            input.voiceoverAudioPath,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=increase,crop=${input.settings.width}:${input.settings.height}`,
            "-c:v",
            input.settings.videoCodec,
            "-preset",
            input.settings.preset,
            "-crf",
            String(input.settings.crf),
            "-c:a",
            input.settings.audioCodec,
            "-b:a",
            input.settings.audioBitrate,
            "-shortest",
            "-movflags",
            "+faststart",
            input.finalVideoPath,
          ]
        : [
            "-y",
            "-i",
            input.joinedScenesPath,
            "-vf",
            `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=increase,crop=${input.settings.width}:${input.settings.height}`,
            "-c:v",
            input.settings.videoCodec,
            "-preset",
            input.settings.preset,
            "-crf",
            String(input.settings.crf),
            "-movflags",
            "+faststart",
            input.finalVideoPath,
          ];
      await runProcess(input.ffmpegPath, args);
      return { metadata: { renderer: "ffmpeg_mux", hasVoiceover: Boolean(input.voiceoverAudioPath) } };
    },
  };
}

async function writeSceneClipsToScratch(input: {
  repository: TourRenderRepository;
  clips: FinalRenderSceneClip[];
  scratchDir: string;
}): Promise<string[]> {
  const paths: string[] = [];
  for (const [index, clip] of input.clips.entries()) {
    if (clip.asset.storageBucket !== "tours-generated-media" || !clip.asset.storagePath) {
      throw new TourFinalRenderError(
        "Stored scene clip asset is missing a storage object.",
        "SCENE_CLIP_STORAGE_MISSING"
      );
    }

    const bytes = await input.repository.downloadRenderAssetBytes({
      storageBucket: clip.asset.storageBucket,
      storagePath: clip.asset.storagePath,
    });
    if (!bytes) {
      throw new TourFinalRenderError(
        "Could not download stored scene clip.",
        "SCENE_CLIP_DOWNLOAD_FAILED"
      );
    }

    const clipPath = path.join(input.scratchDir, `${String(index + 1).padStart(2, "0")}-${clip.asset.id}.mp4`);
    await writeFile(clipPath, bytes);
    paths.push(clipPath);
  }
  return paths;
}

async function writeVoiceoverToScratch(input: {
  repository: TourRenderRepository;
  voiceoverAsset: TourRenderAsset;
  scratchDir: string;
}): Promise<string> {
  if (input.voiceoverAsset.storageBucket !== "tours-generated-media" || !input.voiceoverAsset.storagePath) {
    throw new TourFinalRenderError(
      "Stored voiceover asset is missing a storage object.",
      "VOICEOVER_STORAGE_MISSING"
    );
  }

  const bytes = await input.repository.downloadRenderAssetBytes({
    storageBucket: input.voiceoverAsset.storageBucket,
    storagePath: input.voiceoverAsset.storagePath,
  });
  if (!bytes) {
    throw new TourFinalRenderError(
      "Could not download stored voiceover audio.",
      "VOICEOVER_DOWNLOAD_FAILED"
    );
  }

  const voiceoverPath = path.join(input.scratchDir, `${input.voiceoverAsset.id}.mp3`);
  await writeFile(voiceoverPath, bytes);
  return voiceoverPath;
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

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
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
