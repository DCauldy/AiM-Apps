import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getProfileApiKey } from "@/lib/user-api-keys/service";
import { createHeyGenAvatarProvider } from "./heygen-avatar-provider";
import {
  buildHeyGenAvatarFingerprint,
  buildHeyGenAvatarVideoFingerprint,
  hashHeyGenAvatarFingerprint,
  hashHeyGenAvatarVideoFingerprint,
} from "./tour-avatar-fingerprint";
import { prepareHeyGenAvatarMetadata } from "./tour-avatar-metadata";
import { generateHeyGenAvatarVideo } from "./tour-avatar-provider-workflow";
import {
  DEFAULT_FRAME_CHECK_TIMESTAMPS_SECONDS,
  DEFAULT_HEYGEN_GENERATION_OPTIONS,
  DEFAULT_HEYGEN_POSITIONING,
  INSTAGRAM_STORY_CANVAS,
  TourAvatarError,
  type HeyGenAvatarMetadata,
  type HeyGenAvatarProvider,
  type HeyGenAvatarResolvedPositioning,
  type HeyGenAvatarSize,
  type HeyGenAvatarStageOptions,
  type HeyGenAvatarStageResult,
  type HeyGenAvatarSource,
  type VideoCanvas,
} from "./tour-avatar.types";
import type { TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";

export { createHeyGenAvatarProvider } from "./heygen-avatar-provider";
export {
  analyzeHeyGenAvatarAlpha,
  collectWorkflowWarnings,
  exportHeyGenAvatarFrameChecks,
} from "./tour-avatar-analysis";
export {
  buildHeyGenAvatarFingerprint,
  buildHeyGenAvatarVideoFingerprint,
  hashHeyGenAvatarFingerprint,
  hashHeyGenAvatarVideoFingerprint,
} from "./tour-avatar-fingerprint";
export { buildHeyGenAvatarOverlayPlan, resolveHeyGenAvatarPlacement } from "./tour-avatar-layout";
export { prepareHeyGenAvatarMetadata } from "./tour-avatar-metadata";
export { generateHeyGenAvatarVideo, waitForHeyGenAvatarVideo } from "./tour-avatar-provider-workflow";
export * from "./tour-avatar.types";

export function resolveHeyGenAvatarStageOptions(options: HeyGenAvatarStageOptions = {}): {
  reuseExistingAssets: boolean;
  avatarId: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: HeyGenAvatarResolvedPositioning;
  generation: typeof DEFAULT_HEYGEN_GENERATION_OPTIONS;
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
  const avatarVideoFingerprint = buildHeyGenAvatarVideoFingerprint({
    source: input.source,
    voiceoverAudioAsset: input.voiceoverAudioAsset,
    existingAvatarAsset: input.existingAvatarAsset,
    avatarId: resolvedOptions.avatarId,
    generation: resolvedOptions.generation,
  });
  const avatarVideoFingerprintHash = hashHeyGenAvatarVideoFingerprint(avatarVideoFingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const [avatarAsset, legacyAvatarAsset, metadataAsset] = await Promise.all([
      input.repository.findReusableAsset({
        projectId: input.projectId,
        kind: "avatar_video",
        fingerprintHash: avatarVideoFingerprintHash,
        sceneId: null,
      }),
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
    const reusableAvatarAsset = avatarAsset ?? legacyAvatarAsset;

    if (reusableAvatarAsset && metadataAsset) {
      await recordReusedAvatarAssets({
        repository: input.repository,
        runId: input.runId,
        avatarAsset: reusableAvatarAsset,
        metadataAsset,
      });

      return {
        reused: true,
        avatarAsset: reusableAvatarAsset,
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
    const reusableAvatarAsset = resolvedOptions.reuseExistingAssets
      ? await findReusableAvatarVideo({
          repository: input.repository,
          projectId: input.projectId,
          avatarVideoFingerprintHash,
          legacyFingerprintHash: fingerprintHash,
        })
      : null;
    const sourceVideoPath = await resolveAvatarSourceVideoPath({
      source: input.source,
      outputPath: avatarVideoPath,
      reusableAvatarAsset,
      repository: input.repository,
      avatarId: resolvedOptions.avatarId,
      generation: resolvedOptions.generation,
      provider: input.provider ?? createHeyGenAvatarProvider(),
      apiKey: () => resolveHeyGenApiKey(input.profileId, input.getApiKey),
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
    const metadataAsset = await createAvatarMetadataAsset({
      input,
      metadata,
      avatarId: resolvedOptions.avatarId,
      fingerprintHash,
      fingerprint,
    });
    const avatarAsset =
      reusableAvatarAsset ??
      (await createAvatarVideoAsset({
        input,
        sourceVideoPath,
        metadata,
        avatarId: resolvedOptions.avatarId,
        avatarVideoFingerprintHash,
        avatarVideoFingerprint,
      }));

    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: avatarAsset.id,
      usage: reusableAvatarAsset ? "reused" : "created",
    });
    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: metadataAsset.id,
      usage: "created",
    });

    return {
      reused: Boolean(reusableAvatarAsset),
      avatarAsset,
      metadataAsset,
      metadata,
      fingerprintHash,
      fingerprint,
    } as HeyGenAvatarStageResult;
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

async function findReusableAvatarVideo(input: {
  repository: TourRenderRepository;
  projectId: string;
  avatarVideoFingerprintHash: string;
  legacyFingerprintHash: string;
}): Promise<TourRenderAsset | null> {
  return (
    (await input.repository.findReusableAsset({
      projectId: input.projectId,
      kind: "avatar_video",
      fingerprintHash: input.avatarVideoFingerprintHash,
      sceneId: null,
    })) ??
    (await input.repository.findReusableAsset({
      projectId: input.projectId,
      kind: "avatar_video",
      fingerprintHash: input.legacyFingerprintHash,
      sceneId: null,
    }))
  );
}

async function resolveAvatarSourceVideoPath(input: {
  source: HeyGenAvatarSource;
  outputPath: string;
  reusableAvatarAsset: TourRenderAsset | null;
  repository: TourRenderRepository;
  avatarId: string;
  generation: typeof DEFAULT_HEYGEN_GENERATION_OPTIONS;
  provider?: HeyGenAvatarProvider;
  apiKey: () => Promise<string>;
}): Promise<string> {
  if (input.reusableAvatarAsset) {
    return downloadReusableAvatarVideo({
      repository: input.repository,
      avatarAsset: input.reusableAvatarAsset,
      outputPath: input.outputPath,
    });
  }

  if (input.source.mode === "existing") {
    return resolveExistingAvatarPath(input.source.avatarVideoPath);
  }

  return generateHeyGenAvatarVideo({
    source: input.source,
    outputPath: input.outputPath,
    avatarId: input.avatarId,
    generation: input.generation,
    provider: input.provider,
    apiKey: await input.apiKey(),
  });
}

async function createAvatarVideoAsset(input: {
  input: Parameters<typeof prepareHeyGenAvatarStage>[0];
  sourceVideoPath: string;
  metadata: HeyGenAvatarMetadata;
  avatarId: string;
  avatarVideoFingerprintHash: string;
  avatarVideoFingerprint: Record<string, unknown>;
}): Promise<TourRenderAsset> {
  const upload = await input.input.repository.uploadRenderAssetBytes({
    userId: input.input.userId,
    projectId: input.input.projectId,
    runId: input.input.runId,
    kind: "avatar_video",
    content: await readFile(input.sourceVideoPath),
    contentType: "video/webm",
    extension: "webm",
  });
  if (!upload) {
    throw new TourAvatarError("Could not upload HeyGen avatar video.", "AVATAR_VIDEO_UPLOAD_FAILED");
  }

  const asset = await input.input.repository.createAsset({
    projectId: input.input.projectId,
    createdByRunId: input.input.runId,
    kind: "avatar_video",
    storageBucket: upload.storageBucket,
    storagePath: upload.storagePath,
    contentType: upload.contentType,
    fingerprintHash: input.avatarVideoFingerprintHash,
    fingerprint: input.avatarVideoFingerprint,
    reusable: true,
    metadata: avatarAssetMetadata(input.input.source, input.metadata, input.avatarId),
  });
  if (!asset) {
    throw new TourAvatarError("Could not create HeyGen avatar video asset.", "AVATAR_VIDEO_ASSET_CREATE_FAILED");
  }
  return asset;
}

async function createAvatarMetadataAsset(input: {
  input: Parameters<typeof prepareHeyGenAvatarStage>[0];
  metadata: HeyGenAvatarMetadata;
  avatarId: string;
  fingerprintHash: string;
  fingerprint: Record<string, unknown>;
}): Promise<TourRenderAsset> {
  const upload = await input.input.repository.uploadRenderAssetJson({
    userId: input.input.userId,
    projectId: input.input.projectId,
    runId: input.input.runId,
    kind: "avatar_metadata",
    value: input.metadata,
  });
  if (!upload) {
    throw new TourAvatarError("Could not upload HeyGen avatar metadata.", "AVATAR_METADATA_UPLOAD_FAILED");
  }

  const asset = await input.input.repository.createAsset({
    projectId: input.input.projectId,
    createdByRunId: input.input.runId,
    kind: "avatar_metadata",
    storageBucket: upload.storageBucket,
    storagePath: upload.storagePath,
    contentType: upload.contentType,
    fingerprintHash: input.fingerprintHash,
    fingerprint: input.fingerprint,
    reusable: true,
    metadata: avatarAssetMetadata(input.input.source, input.metadata, input.avatarId),
  });
  if (!asset) {
    throw new TourAvatarError("Could not create HeyGen avatar metadata asset.", "AVATAR_METADATA_ASSET_CREATE_FAILED");
  }
  return asset;
}

function avatarAssetMetadata(
  source: HeyGenAvatarSource,
  metadata: HeyGenAvatarMetadata,
  avatarId: string | null
): Record<string, unknown> {
  return {
    provider: "heygen",
    avatarId: source.mode === "generate" ? avatarId : null,
    sourceMode: source.mode,
    cropRiskLevel: metadata.analysis.cropRisk.level,
    warningCount: metadata.warnings.length,
  };
}

async function recordReusedAvatarAssets(input: {
  repository: TourRenderRepository;
  runId: string;
  avatarAsset: TourRenderAsset;
  metadataAsset: TourRenderAsset;
}): Promise<void> {
  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: input.avatarAsset.id,
    usage: "reused",
  });
  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: input.metadataAsset.id,
    usage: "reused",
  });
}

async function downloadReusableAvatarVideo(input: {
  repository: TourRenderRepository;
  avatarAsset: TourRenderAsset;
  outputPath: string;
}): Promise<string> {
  if (
    input.avatarAsset.storageBucket !== "tours-generated-media" ||
    !input.avatarAsset.storagePath
  ) {
    throw new TourAvatarError(
      "Stored HeyGen avatar video could not be loaded.",
      "MISSING_AVATAR_SOURCE"
    );
  }

  const content = await input.repository.downloadRenderAssetBytes({
    storageBucket: input.avatarAsset.storageBucket,
    storagePath: input.avatarAsset.storagePath,
  });
  if (!content) {
    throw new TourAvatarError(
      "Stored HeyGen avatar video could not be downloaded.",
      "MISSING_AVATAR_SOURCE"
    );
  }

  await writeFile(input.outputPath, content);
  return input.outputPath;
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
