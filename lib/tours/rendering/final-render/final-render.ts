import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";
import type { HeyGenAvatarMetadata } from "../avatars/tour-avatar";
import {
  buildSceneTransitionJoinArgs,
  expectedJoinedScenesDurationSeconds,
  joinedSceneTransitionEffectSegments,
  resolveSceneTransitionEffectSettings,
  type SceneClipHandlePlan,
  type ResolvedSceneTransitionEffect,
  type SceneTransitionEffectSettings,
} from "../transitions/scene-transition-effects";
import {
  assertVideoDurationAtLeast,
  assertVideoDurationClose,
  probeVideoDurationSeconds,
  type VideoDurationProbe,
} from "./video-duration";
import { hashJsonFingerprint } from "../fingerprint";

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
  reuseExistingAssets?: boolean;
  concatSettings?: {
    safe?: 0 | 1;
    copyCodec?: boolean;
  };
  muxSettings?: FinalRenderSettings;
  outputPreset?: "vertical_1080p_h264_aac";
  sceneTransitions?: {
    effect?: ResolvedSceneTransitionEffect;
  };
};

export type FinalRenderSceneClip = {
  sceneId: string;
  durationSeconds: number;
  requestedDurationSeconds: number;
  handlePlan: SceneClipHandlePlan;
  transitionEffect?: ResolvedSceneTransitionEffect;
  asset: TourRenderAsset;
  fingerprintHash: string;
};

export type FinalRenderAvatarOverlay = {
  avatarAsset: TourRenderAsset;
  metadataAsset: TourRenderAsset;
  metadata: HeyGenAvatarMetadata;
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
  transitionSettings: SceneTransitionEffectSettings;
  boundaryTransitionEffects: Array<{
    fromSceneId: string;
    toSceneId: string;
    effect: ResolvedSceneTransitionEffect;
    durationSeconds: number;
  }>;
  expectedDurationSeconds: number;
  clipHandlePlans: ReturnType<typeof joinedSceneTransitionEffectSegments>;
};

export type FinalVideoAvatarOverlayFingerprint = {
  assetId: string;
  fingerprintHash: string;
  metadataAssetId: string;
  metadataFingerprintHash: string;
  placement: HeyGenAvatarMetadata["overlay"]["placement"];
  canvas: HeyGenAvatarMetadata["overlay"]["canvas"];
  size: HeyGenAvatarMetadata["overlay"]["size"];
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
  avatarOverlay: FinalVideoAvatarOverlayFingerprint | null;
};

export type FinalVideoRendererInput = {
  concatFilePath: string;
  sceneClipPaths: string[];
  clips: FinalRenderSceneClip[];
  joinedScenesPath: string;
  finalVideoPath: string;
  voiceoverAudioPath?: string;
  avatarVideoPath?: string;
  avatarOverlay?: HeyGenAvatarMetadata["overlay"];
  settings: ResolvedFinalRenderSettings;
  transitionSettings: SceneTransitionEffectSettings;
  expectedJoinedDurationSeconds: number;
  ffmpegPath: string;
};

export type FinalVideoRenderer = {
  joinSceneClips(input: FinalVideoRendererInput): Promise<{ metadata?: Record<string, unknown> }>;
  muxFinalVideo(input: FinalVideoRendererInput): Promise<{ metadata?: Record<string, unknown> }>;
};

export type FinalRenderStageResult = {
  joinedScenesAsset: TourRenderAsset | null;
  finalVideoAsset: TourRenderAsset;
  joinedScenesFingerprint: JoinedScenesFingerprint;
  joinedScenesFingerprintHash: string;
  finalVideoFingerprint: FinalVideoFingerprint;
  finalVideoFingerprintHash: string;
  reusedFinalVideo: boolean;
  reusedJoinedScenes: boolean;
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
      | "AVATAR_STORAGE_MISSING"
      | "AVATAR_DOWNLOAD_FAILED"
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
    reuseExistingAssets: options.reuseExistingAssets !== false,
    concatSettings: {
      safe: options.concatSettings?.safe ?? 0,
      copyCodec: options.concatSettings?.copyCodec ?? true,
    },
    muxSettings: {
      ...DEFAULT_FINAL_RENDER_SETTINGS,
      ...(options.muxSettings ?? {}),
    },
    outputPreset: options.outputPreset ?? "vertical_1080p_h264_aac",
    sceneTransitions: resolveSceneTransitionEffectSettings(options.sceneTransitions),
  } as const;
}

export function buildJoinedScenesFingerprint(input: {
  clips: FinalRenderSceneClip[];
  concatSettings: JoinedScenesFingerprint["concatSettings"];
  transitionSettings: SceneTransitionEffectSettings;
}): JoinedScenesFingerprint {
  const handlePlans = input.clips.map((clip) => clip.handlePlan);
  const boundaryTransitionEffects = input.clips.slice(1).map((clip, index) => ({
    fromSceneId: input.clips[index]?.sceneId ?? "",
    toSceneId: clip.sceneId,
    effect: clip.transitionEffect ?? input.transitionSettings.effect,
    durationSeconds: input.transitionSettings.durationSeconds,
  }));
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
    transitionSettings: input.transitionSettings,
    boundaryTransitionEffects,
    expectedDurationSeconds: expectedJoinedScenesDurationSeconds(handlePlans),
    clipHandlePlans: joinedSceneTransitionEffectSegments(handlePlans),
  };
}

export function buildFinalVideoFingerprint(input: {
  joinedScenesFingerprintHash: string;
  voiceoverAsset?: TourRenderAsset | null;
  avatarOverlay?: FinalRenderAvatarOverlay | null;
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
    avatarOverlay: input.avatarOverlay
      ? {
          assetId: input.avatarOverlay.avatarAsset.id,
          fingerprintHash: input.avatarOverlay.avatarAsset.fingerprintHash,
          metadataAssetId: input.avatarOverlay.metadataAsset.id,
          metadataFingerprintHash: input.avatarOverlay.metadataAsset.fingerprintHash,
          placement: input.avatarOverlay.metadata.overlay.placement,
          canvas: input.avatarOverlay.metadata.overlay.canvas,
          size: input.avatarOverlay.metadata.overlay.size,
        }
      : null,
  };
}

export function hashFinalRenderFingerprint(
  fingerprint: JoinedScenesFingerprint | FinalVideoFingerprint
): string {
  return hashJsonFingerprint(fingerprint);
}

export async function renderFinalVideoStage(input: {
  projectId: string;
  userId: string;
  runId: string;
  repository: TourRenderRepository;
  clips: FinalRenderSceneClip[];
  voiceoverAsset?: TourRenderAsset | null;
  avatarOverlay?: FinalRenderAvatarOverlay | null;
  renderer?: FinalVideoRenderer;
  options?: FinalRenderStageOptions;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
}): Promise<FinalRenderStageResult> {
  if (input.clips.length === 0) {
    throw new TourFinalRenderError("Final render needs at least one scene clip.", "NO_SCENE_CLIPS");
  }

  const resolvedOptions = resolveFinalRenderStageOptions(input.options);
  const joinedScenesFingerprint = buildJoinedScenesFingerprint({
    clips: input.clips,
    concatSettings: resolvedOptions.concatSettings,
    transitionSettings: resolvedOptions.sceneTransitions,
  });
  const joinedScenesFingerprintHash = hashFinalRenderFingerprint(joinedScenesFingerprint);
  const finalVideoFingerprint = buildFinalVideoFingerprint({
    joinedScenesFingerprintHash,
    voiceoverAsset: input.voiceoverAsset,
    avatarOverlay: input.avatarOverlay,
    muxSettings: resolvedOptions.muxSettings,
    outputPreset: resolvedOptions.outputPreset,
  });
  const finalVideoFingerprintHash = hashFinalRenderFingerprint(finalVideoFingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const reusableFinalVideo = await input.repository.findReusableAsset({
      projectId: input.projectId,
      kind: "final_video",
      fingerprintHash: finalVideoFingerprintHash,
    });

    if (reusableFinalVideo) {
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: reusableFinalVideo.id,
        usage: "reused",
      });

      return {
        joinedScenesAsset: null,
        finalVideoAsset: reusableFinalVideo,
        joinedScenesFingerprint,
        joinedScenesFingerprintHash,
        finalVideoFingerprint,
        finalVideoFingerprintHash,
        reusedFinalVideo: true,
        reusedJoinedScenes: false,
      };
    }
  }

  const scratchDir = path.join(tmpdir(), "aim-tours-render", input.runId, "final-render");
  const joinedScenesPath = path.join(scratchDir, "joined-scenes.mp4");
  const finalVideoPath = path.join(scratchDir, "final-video.mp4");
  const concatFilePath = path.join(scratchDir, "clips.txt");
  const renderer = input.renderer ?? createFfmpegFinalVideoRenderer();

  try {
    await mkdir(scratchDir, { recursive: true });
    const voiceoverAudioPath = input.voiceoverAsset
      ? await writeVoiceoverToScratch({
          repository: input.repository,
          voiceoverAsset: input.voiceoverAsset,
          scratchDir,
        })
      : undefined;
    const avatarVideoPath = input.avatarOverlay
      ? await writeAvatarToScratch({
          repository: input.repository,
          avatarAsset: input.avatarOverlay.avatarAsset,
          scratchDir,
        })
      : undefined;

    let sceneClipPaths: string[] = [];
    let joinedScenes: { asset: TourRenderAsset; reused: boolean } | null =
      await reuseJoinedScenesAsset({
        projectId: input.projectId,
        runId: input.runId,
        repository: input.repository,
        joinedScenesPath,
        fingerprintHash: joinedScenesFingerprintHash,
        reuseExistingAssets: resolvedOptions.reuseExistingAssets,
      });

    if (!joinedScenes) {
      sceneClipPaths = await writeSceneClipsToScratch({
        repository: input.repository,
        clips: input.clips,
        scratchDir,
      });
      await validateSceneClipDurations({
        clips: input.clips,
        sceneClipPaths,
        durationProbe: input.durationProbe,
        durationToleranceSeconds: input.durationToleranceSeconds,
        shouldProbe: Boolean(input.durationProbe) || !input.renderer,
      });
      await writeFile(
        concatFilePath,
        `${sceneClipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n")}\n`
      );
      joinedScenes = await joinOrReuseJoinedScenes({
        projectId: input.projectId,
        userId: input.userId,
        runId: input.runId,
        repository: input.repository,
        renderer,
        concatFilePath,
        sceneClipPaths,
        clips: input.clips,
        joinedScenesPath,
        finalVideoPath,
        voiceoverAudioPath,
        avatarVideoPath,
        avatarOverlay: input.avatarOverlay?.metadata.overlay,
        settings: resolvedOptions.muxSettings,
        transitionSettings: resolvedOptions.sceneTransitions,
        fingerprint: joinedScenesFingerprint,
        fingerprintHash: joinedScenesFingerprintHash,
        reuseExistingAssets: false,
      });
    }
    if (!joinedScenes) {
      throw new TourFinalRenderError(
        "Could not create joined scene asset record.",
        "JOINED_SCENES_ASSET_CREATE_FAILED"
      );
    }
    await validateJoinedScenesDuration({
      joinedScenesPath,
      expectedDurationSeconds: joinedScenesFingerprint.expectedDurationSeconds,
      durationProbe: input.durationProbe,
      durationToleranceSeconds: input.durationToleranceSeconds,
      shouldProbe: Boolean(input.durationProbe) || !input.renderer,
    });

    let final: { metadata?: Record<string, unknown> };
    try {
      final = await renderer.muxFinalVideo({
        concatFilePath,
        sceneClipPaths,
        clips: input.clips,
        joinedScenesPath,
        finalVideoPath,
        voiceoverAudioPath,
        avatarVideoPath,
        avatarOverlay: input.avatarOverlay?.metadata.overlay,
        settings: resolvedOptions.muxSettings,
        transitionSettings: resolvedOptions.sceneTransitions,
        expectedJoinedDurationSeconds: joinedScenesFingerprint.expectedDurationSeconds,
        ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      });
    } catch (error) {
      throw new TourFinalRenderError(
        appendCauseMessage("Final video mux failed.", error),
        "MUX_FAILED"
      );
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
        joinedScenesAssetId: joinedScenes.asset.id,
        voiceoverAssetId: input.voiceoverAsset?.id ?? null,
        outputPreset: resolvedOptions.outputPreset,
        avatarOverlay: finalVideoFingerprint.avatarOverlay,
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
      joinedScenesAsset: joinedScenes.asset,
      finalVideoAsset,
      joinedScenesFingerprint,
      joinedScenesFingerprintHash,
      finalVideoFingerprint,
      finalVideoFingerprintHash,
      reusedFinalVideo: false,
      reusedJoinedScenes: joinedScenes.reused,
    };
  } catch (error) {
    if (error instanceof TourFinalRenderError) {
      throw error;
    }
    throw new TourFinalRenderError(
      appendCauseMessage("Final video mux failed.", error),
      "MUX_FAILED"
    );
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

export function createFfmpegFinalVideoRenderer(): FinalVideoRenderer {
  return {
    async joinSceneClips(input) {
      if (input.sceneClipPaths.length > 1) {
        await runProcess(
          input.ffmpegPath,
          buildSceneTransitionJoinArgs({
            sceneClipPaths: input.sceneClipPaths,
            handlePlans: input.clips.map((clip) => clip.handlePlan),
            sceneTransitionEffects: input.clips.map(
              (clip) => clip.transitionEffect ?? input.transitionSettings.effect
            ),
            transitionSettings: input.transitionSettings,
            width: input.settings.width,
            height: input.settings.height,
            fps: 30,
            videoCodec: input.settings.videoCodec,
            preset: input.settings.preset,
            crf: input.settings.crf,
            outputPath: input.joinedScenesPath,
          })
        );
        return {
          metadata: {
            renderer: "ffmpeg_scene_transition",
            transitionSettings: input.transitionSettings,
            boundaryTransitionEffects: input.clips.slice(1).map((clip, index) => ({
              fromSceneId: input.clips[index]?.sceneId ?? "",
              toSceneId: clip.sceneId,
              effect: clip.transitionEffect ?? input.transitionSettings.effect,
            })),
            expectedDurationSeconds: input.expectedJoinedDurationSeconds,
          },
        };
      }

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
      return {
        metadata: {
          renderer: "ffmpeg_concat",
          transitionSettings: input.transitionSettings,
          expectedDurationSeconds: input.expectedJoinedDurationSeconds,
        },
      };
    },

    async muxFinalVideo(input) {
      const scaleFilter = `scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=increase,crop=${input.settings.width}:${input.settings.height}`;
      const args = input.avatarVideoPath && input.avatarOverlay
        ? [
            "-y",
            "-i",
            input.joinedScenesPath,
            "-c:v",
            input.avatarOverlay.ffmpeg.avatarInputCodec,
            "-i",
            input.avatarVideoPath,
            ...(input.voiceoverAudioPath ? ["-i", input.voiceoverAudioPath] : []),
            "-filter_complex",
            input.avatarOverlay.ffmpeg.filterComplex,
            "-map",
            "[v]",
            ...(input.voiceoverAudioPath ? ["-map", "2:a:0"] : ["-an"]),
            "-c:v",
            input.avatarOverlay.ffmpeg.outputVideoCodec,
            "-preset",
            input.settings.preset,
            "-crf",
            String(input.settings.crf),
            "-pix_fmt",
            "yuv420p",
            ...(input.voiceoverAudioPath
              ? [
                  "-c:a",
                  input.avatarOverlay.ffmpeg.outputAudioCodec,
                  "-b:a",
                  input.settings.audioBitrate,
                ]
              : []),
            "-shortest",
            "-movflags",
            "+faststart",
            input.finalVideoPath,
          ]
        : input.voiceoverAudioPath
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
            scaleFilter,
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
            scaleFilter,
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
      return {
        metadata: {
          renderer: "ffmpeg_mux",
          hasVoiceover: Boolean(input.voiceoverAudioPath),
          hasAvatarOverlay: Boolean(input.avatarVideoPath && input.avatarOverlay),
        },
      };
    },
  };
}

async function joinOrReuseJoinedScenes(input: {
  projectId: string;
  userId: string;
  runId: string;
  repository: TourRenderRepository;
  renderer: FinalVideoRenderer;
  concatFilePath: string;
  sceneClipPaths: string[];
  clips: FinalRenderSceneClip[];
  joinedScenesPath: string;
  finalVideoPath: string;
  voiceoverAudioPath?: string;
  avatarVideoPath?: string;
  avatarOverlay?: HeyGenAvatarMetadata["overlay"];
  settings: ResolvedFinalRenderSettings;
  transitionSettings: SceneTransitionEffectSettings;
  fingerprint: JoinedScenesFingerprint;
  fingerprintHash: string;
  reuseExistingAssets: boolean;
}): Promise<{ asset: TourRenderAsset; reused: boolean }> {
  const reused = await reuseJoinedScenesAsset(input);
  if (reused) return reused;

  let joined: { metadata?: Record<string, unknown> };
  try {
    joined = await input.renderer.joinSceneClips({
      concatFilePath: input.concatFilePath,
      sceneClipPaths: input.sceneClipPaths,
      clips: input.clips,
      joinedScenesPath: input.joinedScenesPath,
      finalVideoPath: input.finalVideoPath,
      voiceoverAudioPath: input.voiceoverAudioPath,
      avatarVideoPath: input.avatarVideoPath,
      avatarOverlay: input.avatarOverlay,
      settings: input.settings,
      transitionSettings: input.transitionSettings,
      expectedJoinedDurationSeconds: input.fingerprint.expectedDurationSeconds,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
    });
  } catch (error) {
    throw new TourFinalRenderError(
      appendCauseMessage("Scene clip concat failed.", error),
      "CONCAT_FAILED"
    );
  }

  const joinedUpload = await input.repository.uploadRenderAssetBytes({
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    kind: "joined_scenes",
    content: await readFile(input.joinedScenesPath),
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
    fingerprintHash: input.fingerprintHash,
    fingerprint: input.fingerprint,
    reusable: true,
    metadata: {
      sceneClipAssetIds: input.fingerprint.orderedClips.map((clip) => clip.assetId),
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

  return { asset: joinedScenesAsset, reused: false };
}

async function reuseJoinedScenesAsset(input: {
  projectId: string;
  runId: string;
  repository: TourRenderRepository;
  joinedScenesPath: string;
  fingerprintHash: string;
  reuseExistingAssets: boolean;
}): Promise<{ asset: TourRenderAsset; reused: true } | null> {
  if (!input.reuseExistingAssets) {
    return null;
  }

  const reusableJoinedScenes = await input.repository.findReusableAsset({
    projectId: input.projectId,
    kind: "joined_scenes",
    fingerprintHash: input.fingerprintHash,
  });
  if (!reusableJoinedScenes) {
    return null;
  }

  await writeJoinedScenesToScratch({
    repository: input.repository,
    joinedScenesAsset: reusableJoinedScenes,
    joinedScenesPath: input.joinedScenesPath,
  });
  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: reusableJoinedScenes.id,
    usage: "reused",
  });

  return { asset: reusableJoinedScenes, reused: true };
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

async function writeAvatarToScratch(input: {
  repository: TourRenderRepository;
  avatarAsset: TourRenderAsset;
  scratchDir: string;
}): Promise<string> {
  if (input.avatarAsset.storageBucket !== "tours-generated-media" || !input.avatarAsset.storagePath) {
    throw new TourFinalRenderError(
      "Stored avatar asset is missing a storage object.",
      "AVATAR_STORAGE_MISSING"
    );
  }

  const bytes = await input.repository.downloadRenderAssetBytes({
    storageBucket: input.avatarAsset.storageBucket,
    storagePath: input.avatarAsset.storagePath,
  });
  if (!bytes) {
    throw new TourFinalRenderError(
      "Could not download stored avatar video.",
      "AVATAR_DOWNLOAD_FAILED"
    );
  }

  const avatarPath = path.join(input.scratchDir, `${input.avatarAsset.id}.webm`);
  await writeFile(avatarPath, bytes);
  return avatarPath;
}

async function writeJoinedScenesToScratch(input: {
  repository: TourRenderRepository;
  joinedScenesAsset: TourRenderAsset;
  joinedScenesPath: string;
}): Promise<void> {
  if (
    input.joinedScenesAsset.storageBucket !== "tours-generated-media" ||
    !input.joinedScenesAsset.storagePath
  ) {
    throw new TourFinalRenderError(
      "Stored scene clip asset is missing a storage object.",
      "SCENE_CLIP_STORAGE_MISSING"
    );
  }

  const bytes = await input.repository.downloadRenderAssetBytes({
    storageBucket: input.joinedScenesAsset.storageBucket,
    storagePath: input.joinedScenesAsset.storagePath,
  });
  if (!bytes) {
    throw new TourFinalRenderError(
      "Could not download stored scene clip.",
      "SCENE_CLIP_DOWNLOAD_FAILED"
    );
  }

  await writeFile(input.joinedScenesPath, bytes);
}

async function validateSceneClipDurations(input: {
  clips: FinalRenderSceneClip[];
  sceneClipPaths: string[];
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
  shouldProbe: boolean;
}): Promise<void> {
  if (!input.shouldProbe) return;
  const durationProbe = input.durationProbe ?? probeVideoDurationSeconds;

  try {
    for (const [index, clip] of input.clips.entries()) {
      const sceneClipPath = input.sceneClipPaths[index];
      if (!sceneClipPath) {
        throw new Error(`Scene ${clip.sceneId} is missing a downloaded clip path.`);
      }
      const actualSeconds = await durationProbe(sceneClipPath);
      assertVideoDurationAtLeast({
        actualSeconds,
        expectedSeconds: clip.requestedDurationSeconds,
        toleranceSeconds: input.durationToleranceSeconds,
        label: `Scene ${clip.sceneId} clip`,
      });
    }
  } catch (error) {
    throw new TourFinalRenderError(
      error instanceof Error ? error.message : "Scene clip duration validation failed.",
      "CONCAT_FAILED"
    );
  }
}

async function validateJoinedScenesDuration(input: {
  joinedScenesPath: string;
  expectedDurationSeconds: number;
  durationProbe?: VideoDurationProbe;
  durationToleranceSeconds?: number;
  shouldProbe: boolean;
}): Promise<void> {
  if (!input.shouldProbe) return;

  try {
    const actualSeconds = await (input.durationProbe ?? probeVideoDurationSeconds)(
      input.joinedScenesPath
    );
    assertVideoDurationClose({
      actualSeconds,
      expectedSeconds: input.expectedDurationSeconds,
      toleranceSeconds: input.durationToleranceSeconds,
      label: "Joined scenes",
    });
  } catch (error) {
    throw new TourFinalRenderError(
      error instanceof Error ? error.message : "Joined scenes duration validation failed.",
      "CONCAT_FAILED"
    );
  }
}

async function runProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = truncateProcessOutput(`${stderr}${chunk}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(
        new Error(
          detail
            ? `${command} exited with code ${code ?? "unknown"}: ${detail}`
            : `${command} exited with code ${code ?? "unknown"}`
        )
      );
    });
  });
}

function appendCauseMessage(message: string, error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return message;
  }
  return `${message} ${truncateProcessOutput(error.message, 1600)}`;
}

function truncateProcessOutput(value: string, maxLength = 4000): string {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value;
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}
