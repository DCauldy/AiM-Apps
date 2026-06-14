import type { TourRenderAsset } from "./tour-render.repository";

export const HEYGEN_AVATAR_PROVIDER_VERSION = "heygen-avatar-v1";

export type VideoCanvas = {
  width: number;
  height: number;
};

export type HeyGenAvatarAnchor = "bottom-right" | "bottom-left";

export type HeyGenAvatarSizePreset = {
  visibleWidthRatio: number;
  rightMargin: number;
  bottomMargin: number;
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

export type HeyGenAvatarSize = keyof typeof HEYGEN_AVATAR_SIZE_PRESETS;

export type HeyGenAvatarGenerationOptions = {
  aspectRatio: "16:9" | "9:16";
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
  avatarWidth?: number | null;
  alphaThreshold?: number;
};

export type HeyGenAvatarResolvedPositioning = Omit<
  HeyGenAvatarPositioningInput,
  "alphaThreshold" | "avatarWidth"
> & {
  avatarWidth: number | null;
  alphaThreshold: number;
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
  createAvatarVideo(input: HeyGenAvatarProviderInput): Promise<{
    videoId: string;
    metadata?: Record<string, unknown>;
  }>;
  getAvatarVideo(input: {
    apiKey: string;
    videoId: string;
  }): Promise<HeyGenAvatarProviderStatus>;
  downloadAvatarVideo(input: {
    videoUrl: string;
    outputPath: string;
  }): Promise<{ avatarVideoPath: string; metadata?: Record<string, unknown> }>;
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
  positioning: HeyGenAvatarResolvedPositioning;
  sampleEverySeconds: number;
};

export type HeyGenAvatarVideoFingerprint = Pick<
  HeyGenAvatarFingerprint,
  "provider" | "providerModuleVersion" | "avatarId" | "source" | "generation"
> & {
  kind: "avatar_video";
  version: 1;
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

export const DEFAULT_HEYGEN_GENERATION_OPTIONS: HeyGenAvatarGenerationOptions = {
  aspectRatio: "16:9",
  fit: "contain",
  removeBackground: true,
  outputFormat: "webm",
  resolution: "720p",
  engineType: "avatar_v",
};

export const DEFAULT_HEYGEN_POSITIONING: HeyGenAvatarResolvedPositioning = {
  anchor: "bottom-right",
  rightMargin: 0,
  bottomMargin: 0,
  basis: "visibleBoundingBox",
  avatarWidth: null,
  alphaThreshold: 16,
};

export const DEFAULT_FRAME_CHECK_TIMESTAMPS_SECONDS = [1, 6, 12, 30, 45, 55, 61];
