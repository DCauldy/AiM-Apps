import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/user-api-keys/service", () => ({
  getProfileApiKey: vi.fn(),
}));

import {
  DEFAULT_HEYGEN_GENERATION_OPTIONS,
  DEFAULT_HEYGEN_POSITIONING,
  buildHeyGenAvatarFingerprint,
  buildHeyGenAvatarOverlayPlan,
  hashHeyGenAvatarFingerprint,
  prepareHeyGenAvatarStage,
  resolveHeyGenAvatarPlacement,
  waitForHeyGenAvatarVideo,
  type HeyGenAvatarAlphaAnalysis,
  type HeyGenAvatarMetadata,
} from "./tour-avatar";
import type { TourRenderAsset, TourRenderRepository } from "./tour-render.repository";

const analysis: HeyGenAvatarAlphaAnalysis = {
  sourceWidth: 720,
  sourceHeight: 1280,
  sampledFrameCount: 4,
  alphaThreshold: 16,
  medianBox: {
    x: 120,
    y: 100,
    width: 360,
    height: 900,
    right: 480,
    bottom: 1000,
  },
  maxBox: {
    x: 100,
    y: 80,
    width: 400,
    height: 940,
    right: 500,
    bottom: 1020,
  },
  transparentPadding: {
    left: 120,
    right: 240,
    top: 100,
    bottom: 280,
  },
  edgeTouchRate: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  cropRisk: {
    level: "none",
    reasons: [],
  },
};

function renderAsset(overrides: Partial<TourRenderAsset>): TourRenderAsset {
  return {
    id: "asset-1",
    createdByRunId: "run-1",
    projectId: "project-1",
    sceneId: null,
    kind: "avatar_video",
    storageBucket: "tours-generated-media",
    storagePath: "user-1/project-1/run-1/avatar.webm",
    contentType: "video/webm",
    fingerprintHash: "hash",
    fingerprint: {},
    reusable: true,
    metadata: {},
    deletedAt: null,
    storageDeletedAt: null,
    deleteReason: null,
    createdAt: "2026-06-13T12:00:00.000Z",
    ...overrides,
  };
}

describe("tour avatar rendering helpers", () => {
  it("requests horizontal transparent avatar layers by default", () => {
    expect(DEFAULT_HEYGEN_GENERATION_OPTIONS.aspectRatio).toBe("16:9");
    expect(DEFAULT_HEYGEN_GENERATION_OPTIONS.removeBackground).toBe(true);
    expect(DEFAULT_HEYGEN_GENERATION_OPTIONS.outputFormat).toBe("webm");
  });

  it("polls HeyGen status until the generated video is ready", async () => {
    const provider = {
      getAvatarVideo: vi
        .fn()
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "completed", videoUrl: "https://cdn.example/avatar.webm" }),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForHeyGenAvatarVideo({
        apiKey: "heygen-key",
        videoId: "video-1",
        provider,
        sleep,
        pollIntervalMs: 50,
      })
    ).resolves.toEqual({ videoUrl: "https://cdn.example/avatar.webm" });

    expect(provider.getAvatarVideo).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("includes avatar id and positioning in the avatar fingerprint", () => {
    const base = {
      source: {
        mode: "generate" as const,
        title: "Tour",
        audioUrl: "https://example.test/audio.mp3",
      },
      avatarId: "avatar-look-1",
      canvas: { width: 1080, height: 1920 },
      size: "medium" as const,
      positioning: DEFAULT_HEYGEN_POSITIONING,
      generation: DEFAULT_HEYGEN_GENERATION_OPTIONS,
      sampleEverySeconds: 1,
    };

    expect(buildHeyGenAvatarFingerprint(base).avatarId).toBe("avatar-look-1");
    expect(buildHeyGenAvatarFingerprint(base).positioning).toEqual(DEFAULT_HEYGEN_POSITIONING);
    expect(
      buildHeyGenAvatarFingerprint({
        ...base,
        avatarId: "avatar-look-2",
        positioning: { ...DEFAULT_HEYGEN_POSITIONING, bottomMargin: 120 },
      })
    ).not.toEqual(buildHeyGenAvatarFingerprint(base));
  });

  it("builds visible-bounding-box overlay filters for avatar compositing", () => {
    const placement = resolveHeyGenAvatarPlacement({
      canvas: { width: 1080, height: 1920 },
      size: "medium",
      positioning: DEFAULT_HEYGEN_POSITIONING,
      analysis,
    });

    expect(placement.avatarWidth).toBe(1188);
    expect(placement.overlayX).toBe("W-792-0");
    expect(placement.overlayY).toBe("H-1650-0");

    expect(
      buildHeyGenAvatarOverlayPlan({
        canvas: { width: 1080, height: 1920 },
        size: "medium",
        placement,
      }).ffmpeg.filterComplex
    ).toContain("overlay=x=W-792-0:y=H-1650-0:format=auto[v]");
  });

  it("preserves project video-layer width and margins when placing avatars", () => {
    const placement = resolveHeyGenAvatarPlacement({
      canvas: { width: 1080, height: 1920 },
      size: "medium",
      positioning: {
        anchor: "bottom-right",
        rightMargin: -455,
        bottomMargin: -93,
        basis: "videoLayer",
        avatarWidth: 1344,
        alphaThreshold: 16,
      },
      analysis,
    });

    expect(placement.avatarWidth).toBe(1344);
    expect(placement.overlayX).toBe("W-w--455");
    expect(placement.overlayY).toBe("H-h--93");

    expect(
      buildHeyGenAvatarOverlayPlan({
        canvas: { width: 1080, height: 1920 },
        size: "medium",
        placement,
      }).ffmpeg.filterComplex
    ).toContain("scale=1344:-1");
  });

  it("reuses legacy avatar video assets without regenerating HeyGen video", async () => {
    const source = {
      mode: "generate" as const,
      title: "Tour",
      audioUrl: "https://example.test/audio.mp3",
    };
    const voiceoverAudioAsset = {
      id: "asset-voiceover",
      fingerprintHash: "voiceover-hash",
    };
    const fingerprint = buildHeyGenAvatarFingerprint({
      source,
      voiceoverAudioAsset,
      avatarId: "avatar-look-1",
      canvas: { width: 1080, height: 1920 },
      size: "medium",
      positioning: DEFAULT_HEYGEN_POSITIONING,
      generation: DEFAULT_HEYGEN_GENERATION_OPTIONS,
      sampleEverySeconds: 1,
    });
    const legacyFingerprintHash = hashHeyGenAvatarFingerprint(fingerprint);
    const metadata: HeyGenAvatarMetadata = {
      analysis,
      overlay: buildHeyGenAvatarOverlayPlan({
        canvas: { width: 1080, height: 1920 },
        size: "medium",
        placement: resolveHeyGenAvatarPlacement({
          canvas: { width: 1080, height: 1920 },
          size: "medium",
          positioning: DEFAULT_HEYGEN_POSITIONING,
          analysis,
        }),
      }),
      frameChecks: [],
      warnings: [],
    };
    const avatarAsset = renderAsset({
      id: "asset-avatar",
      kind: "avatar_video",
      fingerprintHash: legacyFingerprintHash,
      fingerprint,
    });
    const metadataAsset = renderAsset({
      id: "asset-avatar-metadata",
      kind: "avatar_metadata",
      storagePath: "user-1/project-1/run-1/avatar-metadata.json",
      contentType: "application/json",
      fingerprintHash: legacyFingerprintHash,
      fingerprint,
    });
    const repository = {
      findReusableAsset: vi.fn(async (input) => {
        if (input.kind === "avatar_video" && input.fingerprintHash === legacyFingerprintHash) {
          return avatarAsset;
        }
        if (input.kind === "avatar_metadata" && input.fingerprintHash === legacyFingerprintHash) {
          return metadataAsset;
        }
        return null;
      }),
      recordRunAssetUsage: vi.fn().mockResolvedValue(true),
      downloadRenderAssetJson: vi.fn().mockResolvedValue(metadata),
    } as unknown as TourRenderRepository;
    const provider = {
      createAvatarVideo: vi.fn(),
      getAvatarVideo: vi.fn(),
      downloadAvatarVideo: vi.fn(),
    };

    const result = await prepareHeyGenAvatarStage({
      projectId: "project-1",
      runId: "run-2",
      userId: "user-1",
      profileId: "profile-1",
      source,
      voiceoverAudioAsset,
      repository,
      provider,
      getApiKey: vi.fn(),
      options: {
        avatarId: "avatar-look-1",
      },
    });

    expect(result.reused).toBe(true);
    expect(result.avatarAsset).toBe(avatarAsset);
    expect(provider.createAvatarVideo).not.toHaveBeenCalled();
    expect(provider.downloadAvatarVideo).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-2",
      assetId: "asset-avatar",
      usage: "reused",
    });
  });
});
