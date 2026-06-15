import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getProfileApiKey } from "@/lib/user-api-keys/service";
import { createHeyGenAvatarProvider } from "./heygen-avatar-provider";
import {
  probeHeyGenAvatarVideo,
  runHeyGenAvatarBinaryProcess,
  runHeyGenAvatarVoidProcess,
} from "./tour-avatar-process";
import type { TourRenderAsset, TourRenderRepository } from "./tour-render.repository";

export { createHeyGenAvatarProvider } from "./heygen-avatar-provider";

export const HEYGEN_AVATAR_PROVIDER_VERSION = "heygen-avatar-v1";

export type VideoCanvas = {
  width: number;
  height: number;
};
export type HeyGenAvatarAnchor = "bottom-right" | "bottom-left";
export type HeyGenAvatarSize = keyof typeof HEYGEN_AVATAR_SIZE_PRESETS;
export type HeyGenAvatarSizePreset = {
  visibleWidthRatio: number;
  rightMargin: number;
  bottomMargin: number;
};
export type HeyGenAvatarGenerationOptions = {
  aspectRatio: "9:16";
  fit: "contain";
  removeBackground: true;
  outputFormat: "webm";
  resolution: "720p" | "1080p";
  engineType?: "avatar_v" | "avatar_iv";
};
export type HeyGenAvatarPositioningInput = {
  anchor: HeyGenAvatarAnchor;
  rightMargin: number;
  bottomMargin: number;
  basis: "videoLayer" | "visibleBoundingBox";
  alphaThreshold?: number;
};
export type HeyGenAvatarStageOptions = {
  reuseExistingAssets?: boolean;
  avatarId?: string;
  canvas?: VideoCanvas;
  size?: HeyGenAvatarSize;
  positioning?: HeyGenAvatarPositioningInput;
  generation?: Partial<HeyGenAvatarGenerationOptions>;
  sampleEverySeconds?: number;
  frameCheckTimestampsSeconds?: number[];
};

export type HeyGenAvatarSource =
  | {
      mode: "existing";
      avatarVideoPath: string;
    }
  | {
      mode: "generate";
      title: string;
      audioUrl: string;
    };

export type HeyGenAvatarProviderInput = {
  apiKey: string;
  avatarId: string;
  title: string;
  audioUrl: string;
  generation: HeyGenAvatarGenerationOptions;
};

export type HeyGenAvatarProvider = {
  createAvatarVideo(input: HeyGenAvatarProviderInput): Promise<{ videoId: string; metadata?: Record<string, unknown> }>;
  getAvatarVideo(input: { apiKey: string; videoId: string }): Promise<HeyGenAvatarProviderStatus>;
  downloadAvatarVideo(input: { videoUrl: string; outputPath: string }): Promise<{ avatarVideoPath: string; metadata?: Record<string, unknown> }>;
};

export type HeyGenAvatarProviderStatus =
  | { status: "pending"; metadata?: Record<string, unknown> }
  | { status: "completed"; videoUrl: string; metadata?: Record<string, unknown> }
  | { status: "failed"; message: string; metadata?: Record<string, unknown> };

export type HeyGenAvatarAlphaAnalysis = {
  sourceWidth: number;
  sourceHeight: number;
  sampledFrameCount: number;
  alphaThreshold: number;
  medianBox: VisiblePixelBox;
  maxBox: VisiblePixelBox;
  transparentPadding: AvatarTransparentPadding;
  edgeTouchRate: AvatarEdgeTouchRate;
  cropRisk: AvatarCropRisk;
};

export type VisiblePixelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type AvatarTransparentPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type AvatarEdgeTouchRate = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type AvatarCropRisk = {
  level: "none" | "low" | "medium" | "high";
  reasons: string[];
};

export type HeyGenAvatarResolvedPlacement = {
  avatarWidth: number;
  anchor: HeyGenAvatarAnchor;
  rightMargin: number;
  bottomMargin: number;
  basis: "videoLayer" | "visibleBoundingBox";
  overlayX: string;
  overlayY: string;
};

export type HeyGenAvatarFfmpegOverlayOptions = {
  avatarInputCodec: "libvpx-vp9";
  backgroundFilter: string;
  avatarScaleFilter: string;
  overlayFilter: string;
  filterComplex: string;
  outputVideoCodec: "libx264";
  outputAudioCodec: "aac";
  preserveAlpha: true;
};

export type HeyGenAvatarOverlayPlan = {
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  placement: HeyGenAvatarResolvedPlacement;
  ffmpeg: HeyGenAvatarFfmpegOverlayOptions;
};

export type HeyGenAvatarFrameCheck = {
  timestampSeconds: number;
  path: string;
};

export type HeyGenAvatarWorkflowWarning = {
  code: "avatar-edge-touch" | "avatar-too-tight" | "frame-check-failed";
  message: string;
  severity: "info" | "warning";
};

export type HeyGenAvatarMetadata = {
  analysis: HeyGenAvatarAlphaAnalysis;
  overlay: HeyGenAvatarOverlayPlan;
  frameChecks: HeyGenAvatarFrameCheck[];
  warnings: HeyGenAvatarWorkflowWarning[];
};

export type HeyGenAvatarFingerprint = {
  kind: "avatar";
  version: 1;
  provider: "heygen";
  providerModuleVersion: string;
  avatarId: string | null;
  source: {
    mode: HeyGenAvatarSource["mode"];
    voiceoverAudioAssetId: string | null;
    voiceoverAudioFingerprintHash: string | null;
    existingAvatarFingerprintHash: string | null;
  };
  generation: HeyGenAvatarGenerationOptions | null;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: Required<HeyGenAvatarPositioningInput>;
  sampleEverySeconds: number;
};

export type HeyGenAvatarStageResult =
  | {
      reused: true;
      avatarAsset: TourRenderAsset;
      metadataAsset: TourRenderAsset;
      metadata: HeyGenAvatarMetadata | null;
      fingerprintHash: string;
      fingerprint: HeyGenAvatarFingerprint;
    }
  | {
      reused: false;
      avatarAsset: TourRenderAsset;
      metadataAsset: TourRenderAsset;
      metadata: HeyGenAvatarMetadata;
      fingerprintHash: string;
      fingerprint: HeyGenAvatarFingerprint;
    };

export class TourAvatarError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MISSING_HEYGEN_API_KEY"
      | "MISSING_HEYGEN_AVATAR_ID"
      | "MISSING_AVATAR_SOURCE"
      | "HEYGEN_CREATE_FAILED"
      | "HEYGEN_POLL_FAILED"
      | "HEYGEN_DOWNLOAD_FAILED"
      | "AVATAR_ALPHA_ANALYSIS_FAILED"
      | "AVATAR_LAYOUT_FAILED"
      | "AVATAR_VIDEO_UPLOAD_FAILED"
      | "AVATAR_METADATA_UPLOAD_FAILED"
      | "AVATAR_VIDEO_ASSET_CREATE_FAILED"
      | "AVATAR_METADATA_ASSET_CREATE_FAILED"
      | "FRAME_CHECK_FAILED"
  ) {
    super(message);
    this.name = "TourAvatarError";
  }
}

export const INSTAGRAM_STORY_CANVAS: VideoCanvas = {
  width: 1080,
  height: 1920,
};

export const HEYGEN_AVATAR_SIZE_PRESETS = {
  small: {
    visibleWidthRatio: 0.33,
    rightMargin: 0,
    bottomMargin: 0,
  },
  medium: {
    visibleWidthRatio: 0.55,
    rightMargin: 0,
    bottomMargin: 0,
  },
  large: {
    visibleWidthRatio: 0.7,
    rightMargin: 0,
    bottomMargin: 0,
  },
} as const satisfies Record<string, HeyGenAvatarSizePreset>;

export const DEFAULT_HEYGEN_GENERATION_OPTIONS: HeyGenAvatarGenerationOptions = {
  aspectRatio: "9:16",
  fit: "contain",
  removeBackground: true,
  outputFormat: "webm",
  resolution: "720p",
  engineType: "avatar_v",
};

export const DEFAULT_HEYGEN_POSITIONING: Required<HeyGenAvatarPositioningInput> = {
  anchor: "bottom-right",
  rightMargin: 0,
  bottomMargin: 0,
  basis: "visibleBoundingBox",
  alphaThreshold: 16,
};

const DEFAULT_FRAME_CHECK_TIMESTAMPS_SECONDS = [1, 6, 12, 30, 45, 55, 61];

export function resolveHeyGenAvatarStageOptions(options: HeyGenAvatarStageOptions = {}): {
  reuseExistingAssets: boolean;
  avatarId: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: Required<HeyGenAvatarPositioningInput>;
  generation: HeyGenAvatarGenerationOptions;
  sampleEverySeconds: number;
  frameCheckTimestampsSeconds: number[];
} {
  return {
    reuseExistingAssets: options.reuseExistingAssets !== false,
    avatarId: options.avatarId ?? process.env.HEYGEN_AVATAR_ID ?? "",
    canvas: options.canvas ?? INSTAGRAM_STORY_CANVAS,
    size: options.size ?? "medium",
    positioning: {
      ...DEFAULT_HEYGEN_POSITIONING,
      ...(options.positioning ?? {}),
    },
    generation: {
      ...DEFAULT_HEYGEN_GENERATION_OPTIONS,
      ...(options.generation ?? {}),
    },
    sampleEverySeconds: options.sampleEverySeconds ?? 1,
    frameCheckTimestampsSeconds:
      options.frameCheckTimestampsSeconds ?? DEFAULT_FRAME_CHECK_TIMESTAMPS_SECONDS,
  };
}

export function buildHeyGenAvatarFingerprint(input: {
  source: HeyGenAvatarSource;
  voiceoverAudioAsset?: Pick<TourRenderAsset, "id" | "fingerprintHash"> | null;
  existingAvatarAsset?: Pick<TourRenderAsset, "fingerprintHash"> | null;
  avatarId: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: Required<HeyGenAvatarPositioningInput>;
  generation: HeyGenAvatarGenerationOptions;
  sampleEverySeconds: number;
}): HeyGenAvatarFingerprint {
  return {
    kind: "avatar",
    version: 1,
    provider: "heygen",
    providerModuleVersion: HEYGEN_AVATAR_PROVIDER_VERSION,
    avatarId: input.source.mode === "generate" ? input.avatarId : null,
    source: {
      mode: input.source.mode,
      voiceoverAudioAssetId: input.voiceoverAudioAsset?.id ?? null,
      voiceoverAudioFingerprintHash: input.voiceoverAudioAsset?.fingerprintHash ?? null,
      existingAvatarFingerprintHash: input.existingAvatarAsset?.fingerprintHash ?? null,
    },
    generation: input.source.mode === "generate" ? input.generation : null,
    canvas: input.canvas,
    size: input.size,
    positioning: input.positioning,
    sampleEverySeconds: input.sampleEverySeconds,
  };
}

export function hashHeyGenAvatarFingerprint(fingerprint: HeyGenAvatarFingerprint): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export async function prepareHeyGenAvatarStage(input: {
  projectId: string;
  runId: string;
  userId: string;
  /** Platform profile the HeyGen key lookup is scoped to. */
  profileId: string;
  source: HeyGenAvatarSource;
  repository: TourRenderRepository;
  provider?: HeyGenAvatarProvider;
  voiceoverAudioAsset?: Pick<TourRenderAsset, "id" | "fingerprintHash"> | null;
  existingAvatarAsset?: Pick<TourRenderAsset, "fingerprintHash"> | null;
  getApiKey?: typeof getProfileApiKey;
  options?: HeyGenAvatarStageOptions;
}): Promise<HeyGenAvatarStageResult> {
  const resolvedOptions = resolveHeyGenAvatarStageOptions(input.options);
  const fingerprint = buildHeyGenAvatarFingerprint({
    source: input.source,
    voiceoverAudioAsset: input.voiceoverAudioAsset,
    existingAvatarAsset: input.existingAvatarAsset,
    avatarId: resolvedOptions.avatarId,
    canvas: resolvedOptions.canvas,
    size: resolvedOptions.size,
    positioning: resolvedOptions.positioning,
    generation: resolvedOptions.generation,
    sampleEverySeconds: resolvedOptions.sampleEverySeconds,
  });
  const fingerprintHash = hashHeyGenAvatarFingerprint(fingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const [avatarAsset, metadataAsset] = await Promise.all([
      input.repository.findReusableAsset({
        projectId: input.projectId,
        kind: "avatar_video",
        fingerprintHash,
        sceneId: null,
      }),
      input.repository.findReusableAsset({
        projectId: input.projectId,
        kind: "avatar_metadata",
        fingerprintHash,
        sceneId: null,
      }),
    ]);

    if (avatarAsset && metadataAsset) {
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: avatarAsset.id,
        usage: "reused",
      });
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: metadataAsset.id,
        usage: "reused",
      });

      return {
        reused: true,
        avatarAsset,
        metadataAsset,
        metadata: await downloadAvatarMetadata(input.repository, metadataAsset),
        fingerprintHash,
        fingerprint,
      };
    }
  }

  const scratchDir = path.join(tmpdir(), "aim-tours-render", input.runId, "avatar");
  const avatarVideoPath = path.join(scratchDir, "heygen-avatar.webm");
  const frameChecksDir = path.join(scratchDir, "frame-checks");

  try {
    await mkdir(scratchDir, { recursive: true });
    const sourceVideoPath =
      input.source.mode === "existing"
        ? await resolveExistingAvatarPath(input.source.avatarVideoPath)
        : await generateHeyGenAvatarVideo({
            source: input.source,
            outputPath: avatarVideoPath,
            avatarId: resolvedOptions.avatarId,
            generation: resolvedOptions.generation,
            provider: input.provider ?? createHeyGenAvatarProvider(),
            apiKey: await resolveHeyGenApiKey(input.profileId, input.getApiKey),
          });

    const metadata = await prepareHeyGenAvatarMetadata({
      avatarVideoPath: sourceVideoPath,
      canvas: resolvedOptions.canvas,
      size: resolvedOptions.size,
      positioning: resolvedOptions.positioning,
      sampleEverySeconds: resolvedOptions.sampleEverySeconds,
      frameChecksDir,
      frameCheckTimestampsSeconds: resolvedOptions.frameCheckTimestampsSeconds,
    });

    const avatarUpload = await input.repository.uploadRenderAssetBytes({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "avatar_video",
      content: await readFile(sourceVideoPath),
      contentType: "video/webm",
      extension: "webm",
    });
    if (!avatarUpload) {
      throw new TourAvatarError("Could not upload HeyGen avatar video.", "AVATAR_VIDEO_UPLOAD_FAILED");
    }

    const metadataUpload = await input.repository.uploadRenderAssetJson({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "avatar_metadata",
      value: metadata,
    });
    if (!metadataUpload) {
      throw new TourAvatarError("Could not upload HeyGen avatar metadata.", "AVATAR_METADATA_UPLOAD_FAILED");
    }

    const avatarAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "avatar_video",
      storageBucket: avatarUpload.storageBucket,
      storagePath: avatarUpload.storagePath,
      contentType: avatarUpload.contentType,
      fingerprintHash,
      fingerprint,
      reusable: true,
      metadata: {
        provider: "heygen",
        avatarId: input.source.mode === "generate" ? resolvedOptions.avatarId : null,
        sourceMode: input.source.mode,
        cropRiskLevel: metadata.analysis.cropRisk.level,
        warningCount: metadata.warnings.length,
      },
    });
    if (!avatarAsset) {
      throw new TourAvatarError("Could not create HeyGen avatar video asset.", "AVATAR_VIDEO_ASSET_CREATE_FAILED");
    }

    const metadataAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "avatar_metadata",
      storageBucket: metadataUpload.storageBucket,
      storagePath: metadataUpload.storagePath,
      contentType: metadataUpload.contentType,
      fingerprintHash,
      fingerprint,
      reusable: true,
      metadata: {
        provider: "heygen",
        avatarId: input.source.mode === "generate" ? resolvedOptions.avatarId : null,
        sourceMode: input.source.mode,
        cropRiskLevel: metadata.analysis.cropRisk.level,
        warningCount: metadata.warnings.length,
      },
    });
    if (!metadataAsset) {
      throw new TourAvatarError("Could not create HeyGen avatar metadata asset.", "AVATAR_METADATA_ASSET_CREATE_FAILED");
    }

    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: avatarAsset.id,
      usage: "created",
    });
    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: metadataAsset.id,
      usage: "created",
    });

    return {
      reused: false,
      avatarAsset,
      metadataAsset,
      metadata,
      fingerprintHash,
      fingerprint,
    };
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

export async function generateHeyGenAvatarVideo(input: {
  source: Extract<HeyGenAvatarSource, { mode: "generate" }>;
  outputPath: string;
  apiKey: string;
  avatarId: string;
  generation: HeyGenAvatarGenerationOptions;
  provider: HeyGenAvatarProvider;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<string> {
  if (!input.avatarId.trim()) {
    throw new TourAvatarError("HeyGen avatar id is required.", "MISSING_HEYGEN_AVATAR_ID");
  }

  const created = await input.provider.createAvatarVideo({
    apiKey: input.apiKey,
    avatarId: input.avatarId,
    title: input.source.title,
    audioUrl: input.source.audioUrl,
    generation: input.generation,
  });
  const status = await waitForHeyGenAvatarVideo({
    apiKey: input.apiKey,
    videoId: created.videoId,
    provider: input.provider,
    pollIntervalMs: input.pollIntervalMs,
    maxPollAttempts: input.maxPollAttempts,
    sleep: input.sleep,
  });
  const downloaded = await input.provider.downloadAvatarVideo({
    videoUrl: status.videoUrl,
    outputPath: input.outputPath,
  });
  return downloaded.avatarVideoPath;
}

export async function waitForHeyGenAvatarVideo(input: {
  apiKey: string;
  videoId: string;
  provider: Pick<HeyGenAvatarProvider, "getAvatarVideo">;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<{ videoUrl: string }> {
  const sleepImpl = input.sleep ?? sleep;
  const pollIntervalMs = input.pollIntervalMs ?? 20_000;
  const maxPollAttempts = input.maxPollAttempts ?? 90;

  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    if (attempt > 1) {
      await sleepImpl(pollIntervalMs);
    }

    const status = await input.provider.getAvatarVideo({
      apiKey: input.apiKey,
      videoId: input.videoId,
    });
    if (status.status === "completed") return { videoUrl: status.videoUrl };
    if (status.status === "failed") {
      throw new TourAvatarError(status.message, "HEYGEN_POLL_FAILED");
    }
  }

  throw new TourAvatarError(`HeyGen video timed out: ${input.videoId}`, "HEYGEN_POLL_FAILED");
}

export async function prepareHeyGenAvatarMetadata(input: {
  avatarVideoPath: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: Required<HeyGenAvatarPositioningInput>;
  sampleEverySeconds: number;
  frameChecksDir?: string;
  frameCheckTimestampsSeconds?: number[];
}): Promise<HeyGenAvatarMetadata> {
  const analysis = await analyzeHeyGenAvatarAlpha({
    avatarVideoPath: input.avatarVideoPath,
    alphaThreshold: input.positioning.alphaThreshold,
    sampleEverySeconds: input.sampleEverySeconds,
  });
  const placement = resolveHeyGenAvatarPlacement({
    canvas: input.canvas,
    size: input.size,
    positioning: input.positioning,
    analysis,
  });
  const overlay = buildHeyGenAvatarOverlayPlan({
    canvas: input.canvas,
    size: input.size,
    placement,
  });
  const warnings = collectWorkflowWarnings(analysis);
  let frameChecks: HeyGenAvatarFrameCheck[] = [];

  if (input.frameChecksDir && input.frameCheckTimestampsSeconds?.length) {
    try {
      frameChecks = await exportHeyGenAvatarFrameChecks({
        avatarVideoPath: input.avatarVideoPath,
        outputDir: input.frameChecksDir,
        timestampsSeconds: input.frameCheckTimestampsSeconds,
      });
    } catch (error) {
      warnings.push({
        code: "frame-check-failed",
        message: error instanceof Error ? error.message : "Could not export HeyGen avatar frame checks.",
        severity: "warning",
      });
    }
  }

  return {
    analysis,
    overlay,
    frameChecks,
    warnings,
  };
}

export function resolveHeyGenAvatarPlacement(input: {
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: Required<HeyGenAvatarPositioningInput>;
  analysis: HeyGenAvatarAlphaAnalysis;
}): HeyGenAvatarResolvedPlacement {
  const preset = HEYGEN_AVATAR_SIZE_PRESETS[input.size];
  const targetVisibleWidth = input.canvas.width * preset.visibleWidthRatio;
  if (input.analysis.medianBox.width <= 0 || input.analysis.sourceWidth <= 0) {
    throw new TourAvatarError(
      "Cannot resolve avatar placement from an empty alpha bounding box.",
      "AVATAR_LAYOUT_FAILED"
    );
  }

  const scaleFactor = targetVisibleWidth / input.analysis.medianBox.width;
  const avatarWidth = Math.round(input.analysis.sourceWidth * scaleFactor);
  const horizontalMargin = input.positioning.rightMargin ?? preset.rightMargin;
  const bottomMargin = input.positioning.bottomMargin ?? preset.bottomMargin;
  let overlayX: string;
  let overlayY: string;

  if (input.positioning.basis === "videoLayer") {
    overlayX =
      input.positioning.anchor === "bottom-right"
        ? `W-w-${formatNumber(horizontalMargin)}`
        : formatNumber(horizontalMargin);
    overlayY = `H-h-${formatNumber(bottomMargin)}`;
  } else {
    const visibleLeft = input.analysis.medianBox.x * scaleFactor;
    const visibleRight = input.analysis.medianBox.right * scaleFactor;
    const visibleBottom = input.analysis.medianBox.bottom * scaleFactor;
    overlayX =
      input.positioning.anchor === "bottom-right"
        ? `W-${formatNumber(visibleRight)}-${formatNumber(horizontalMargin)}`
        : `${formatNumber(horizontalMargin)}-${formatNumber(visibleLeft)}`;
    overlayY = `H-${formatNumber(visibleBottom)}-${formatNumber(bottomMargin)}`;
  }

  return {
    avatarWidth,
    anchor: input.positioning.anchor,
    rightMargin: horizontalMargin,
    bottomMargin,
    basis: input.positioning.basis,
    overlayX,
    overlayY,
  };
}

export function buildHeyGenAvatarOverlayPlan(input: {
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  placement: HeyGenAvatarResolvedPlacement;
}): HeyGenAvatarOverlayPlan {
  const avatarScaleFilter = `scale=${input.placement.avatarWidth}:-1`;
  const backgroundFilter =
    `[0:v]scale=${input.canvas.width}:${input.canvas.height}:force_original_aspect_ratio=increase,` +
    `crop=${input.canvas.width}:${input.canvas.height}[bg]`;
  const overlayFilter = `[1:v]${avatarScaleFilter}[av];[bg][av]overlay=x=${input.placement.overlayX}:y=${input.placement.overlayY}:format=auto[v]`;

  return {
    canvas: input.canvas,
    size: input.size,
    placement: input.placement,
    ffmpeg: {
      avatarInputCodec: "libvpx-vp9",
      backgroundFilter,
      avatarScaleFilter,
      overlayFilter,
      filterComplex: `${backgroundFilter};${overlayFilter}`,
      outputVideoCodec: "libx264",
      outputAudioCodec: "aac",
      preserveAlpha: true,
    },
  };
}

export async function analyzeHeyGenAvatarAlpha(input: {
  avatarVideoPath: string;
  alphaThreshold: number;
  sampleEverySeconds: number;
}): Promise<HeyGenAvatarAlphaAnalysis> {
  const { width, height, durationSeconds } = await probeHeyGenAvatarVideo(input.avatarVideoPath);
  const sampleEverySeconds = Math.max(input.sampleEverySeconds, 0.1);
  const frameRate = 1 / sampleEverySeconds;
  const raw = await runHeyGenAvatarBinaryProcess(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-v",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      input.avatarVideoPath,
      "-vf",
      `fps=${frameRate},format=rgba`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    `Could not decode HeyGen avatar alpha frames from ${input.avatarVideoPath}`
  );

  const frameSize = width * height * 4;
  if (frameSize <= 0 || raw.stdoutBuffer.length < frameSize) {
    throw new TourAvatarError(
      "No sampled RGBA frames were decoded from the HeyGen avatar.",
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }

  const expectedFrames = Math.max(1, Math.ceil(durationSeconds / sampleEverySeconds));
  const frameCount = Math.min(Math.floor(raw.stdoutBuffer.length / frameSize), expectedFrames);
  const boxes: VisiblePixelBox[] = [];
  const edgeTouches = { left: 0, right: 0, top: 0, bottom: 0 };

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const offset = frameIndex * frameSize;
    const box = readVisiblePixelBox(raw.stdoutBuffer, offset, width, height, input.alphaThreshold);
    if (!box) continue;
    boxes.push(box);
    if (box.x <= 1) edgeTouches.left += 1;
    if (box.right >= width - 2) edgeTouches.right += 1;
    if (box.y <= 1) edgeTouches.top += 1;
    if (box.bottom >= height - 2) edgeTouches.bottom += 1;
  }

  if (!boxes.length) {
    throw new TourAvatarError(
      "No non-transparent pixels were found in sampled HeyGen avatar frames.",
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }

  const medianBox = medianVisibleBox(boxes);
  const maxBox = unionVisibleBox(boxes);
  const sampledFrameCount = boxes.length;
  const edgeTouchRate = {
    left: edgeTouches.left / sampledFrameCount,
    right: edgeTouches.right / sampledFrameCount,
    top: edgeTouches.top / sampledFrameCount,
    bottom: edgeTouches.bottom / sampledFrameCount,
  };

  return {
    sourceWidth: width,
    sourceHeight: height,
    sampledFrameCount,
    alphaThreshold: input.alphaThreshold,
    medianBox,
    maxBox,
    transparentPadding: {
      left: medianBox.x,
      right: width - medianBox.right,
      top: medianBox.y,
      bottom: height - medianBox.bottom,
    },
    edgeTouchRate,
    cropRisk: resolveCropRisk({ sourceWidth: width, maxBox, edgeTouchRate }),
  };
}

export async function exportHeyGenAvatarFrameChecks(input: {
  avatarVideoPath: string;
  outputDir: string;
  timestampsSeconds: number[];
}): Promise<HeyGenAvatarFrameCheck[]> {
  await mkdir(input.outputDir, { recursive: true });
  const checks: HeyGenAvatarFrameCheck[] = [];

  for (const timestampSeconds of input.timestampsSeconds) {
    const outputPath = path.join(input.outputDir, `heygen-avatar-${formatTimestampForFile(timestampSeconds)}s.png`);
    await runHeyGenAvatarVoidProcess(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      String(timestampSeconds),
      "-c:v",
      "libvpx-vp9",
      "-i",
      input.avatarVideoPath,
      "-frames:v",
      "1",
      outputPath,
    ]).catch((error) => {
      throw new TourAvatarError(
        `Could not export HeyGen avatar frame at ${timestampSeconds}s: ${error instanceof Error ? error.message : String(error)}`,
        "FRAME_CHECK_FAILED"
      );
    });
    checks.push({ timestampSeconds, path: outputPath });
  }

  return checks;
}

async function resolveHeyGenApiKey(
  profileId: string,
  getApiKey: typeof getProfileApiKey = getProfileApiKey
): Promise<string> {
  const apiKey = await getApiKey(profileId, "heygen");
  if (!apiKey) {
    throw new TourAvatarError("HeyGen API key is required for avatar generation.", "MISSING_HEYGEN_API_KEY");
  }
  return apiKey;
}

async function resolveExistingAvatarPath(avatarVideoPath: string): Promise<string> {
  const resolved = path.resolve(avatarVideoPath);
  try {
    await access(resolved);
    return resolved;
  } catch {
    throw new TourAvatarError(`Missing existing HeyGen avatar video: ${resolved}`, "MISSING_AVATAR_SOURCE");
  }
}

async function downloadAvatarMetadata(
  repository: TourRenderRepository,
  asset: TourRenderAsset
): Promise<HeyGenAvatarMetadata | null> {
  if (asset.storageBucket !== "tours-generated-media" || !asset.storagePath) return null;
  const value = await repository.downloadRenderAssetJson({
    storageBucket: asset.storageBucket,
    storagePath: asset.storagePath,
  });
  return isHeyGenAvatarMetadata(value) ? value : null;
}

function isHeyGenAvatarMetadata(value: unknown): value is HeyGenAvatarMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<HeyGenAvatarMetadata>;
  return Boolean(metadata.analysis && metadata.overlay && Array.isArray(metadata.warnings));
}

function readVisiblePixelBox(
  buffer: Buffer,
  frameOffset: number,
  width: number,
  height: number,
  alphaThreshold: number
): VisiblePixelBox | undefined {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = buffer[frameOffset + (y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return undefined;
  return toVisibleBox(minX, minY, maxX + 1, maxY + 1);
}

function toVisibleBox(left: number, top: number, right: number, bottom: number): VisiblePixelBox {
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function medianVisibleBox(boxes: VisiblePixelBox[]): VisiblePixelBox {
  return toVisibleBox(
    median(boxes.map((box) => box.x)),
    median(boxes.map((box) => box.y)),
    median(boxes.map((box) => box.right)),
    median(boxes.map((box) => box.bottom))
  );
}

function unionVisibleBox(boxes: VisiblePixelBox[]): VisiblePixelBox {
  return toVisibleBox(
    Math.min(...boxes.map((box) => box.x)),
    Math.min(...boxes.map((box) => box.y)),
    Math.max(...boxes.map((box) => box.right)),
    Math.max(...boxes.map((box) => box.bottom))
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function resolveCropRisk(input: {
  sourceWidth: number;
  maxBox: VisiblePixelBox;
  edgeTouchRate: AvatarEdgeTouchRate;
}): AvatarCropRisk {
  const reasons: string[] = [];
  if (input.edgeTouchRate.right > 0.15) reasons.push(`Avatar touches right edge in ${toPercent(input.edgeTouchRate.right)} of sampled frames; arm may be cropped.`);
  if (input.edgeTouchRate.left > 0.15) reasons.push(`Avatar touches left edge in ${toPercent(input.edgeTouchRate.left)} of sampled frames; arm may be cropped.`);
  if (input.edgeTouchRate.bottom > 0.25) reasons.push(`Avatar touches bottom edge in ${toPercent(input.edgeTouchRate.bottom)} of sampled frames; inspect torso framing.`);
  if (input.maxBox.width / input.sourceWidth > 0.92) reasons.push("Avatar visible width uses more than 92% of the source frame; source is very tight.");

  const sideRisk = input.edgeTouchRate.left > 0.15 || input.edgeTouchRate.right > 0.15;
  const level = reasons.length === 0 ? "none" : sideRisk && reasons.length > 1 ? "high" : sideRisk ? "medium" : "low";
  return { level, reasons };
}

function collectWorkflowWarnings(analysis: HeyGenAvatarAlphaAnalysis): HeyGenAvatarWorkflowWarning[] {
  return analysis.cropRisk.reasons.map((reason) => ({
    code: reason.includes("92%") ? "avatar-too-tight" : "avatar-edge-touch",
    message: reason,
    severity: analysis.cropRisk.level === "high" ? "warning" : "info",
  }));
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTimestampForFile(seconds: number): string {
  return formatNumber(seconds).replace(/[^0-9a-z-]+/gi, "-");
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
