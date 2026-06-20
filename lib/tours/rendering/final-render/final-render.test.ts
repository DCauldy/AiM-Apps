import { access, readFile, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourFinalRenderError,
  buildFinalVideoFingerprint,
  buildJoinedScenesFingerprint,
  renderFinalVideoStage,
  type FinalRenderSceneClip,
  type FinalVideoRenderer,
} from "./final-render";
import type { HeyGenAvatarMetadata } from "../avatars/tour-avatar";
import type { TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";
import { resolveTourSceneTransitionSettings } from "../transitions/render-transitions";

const sceneClipAsset1: TourRenderAsset = {
  id: "asset-clip-1",
  createdByRunId: "run-1",
  projectId: "project-1",
  sceneId: "scene-1",
  kind: "scene_clip",
  storageBucket: "tours-generated-media",
  storagePath: "user-1/project-1/run-1/scene-clip-1.mp4",
  contentType: "video/mp4",
  fingerprintHash: "clip-hash-1",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

const sceneClipAsset2: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-clip-2",
  sceneId: "scene-2",
  storagePath: "user-1/project-1/run-1/scene-clip-2.mp4",
  fingerprintHash: "clip-hash-2",
};

function finalSceneClip(input: {
  sceneId: string;
  asset: TourRenderAsset;
  fingerprintHash: string;
  index?: number;
  totalSceneCount?: number;
  durationSeconds?: number;
  requestedDurationSeconds?: number;
  incomingHandleSeconds?: number;
  outgoingHandleSeconds?: number;
}): FinalRenderSceneClip {
  const durationSeconds = input.durationSeconds ?? 4;
  const requestedDurationSeconds = input.requestedDurationSeconds ?? durationSeconds;
  return {
    sceneId: input.sceneId,
    asset: input.asset,
    fingerprintHash: input.fingerprintHash,
    durationSeconds,
    requestedDurationSeconds,
    handlePlan: {
      sceneId: input.sceneId,
      index: input.index ?? 0,
      totalSceneCount: input.totalSceneCount ?? 1,
      targetDurationSeconds: durationSeconds,
      requestedDurationSeconds,
      incomingHandleSeconds: input.incomingHandleSeconds ?? 0,
      outgoingHandleSeconds: input.outgoingHandleSeconds ?? 0,
    },
  };
}

const finalSceneClip1 = finalSceneClip({
  sceneId: "scene-1",
  asset: sceneClipAsset1,
  fingerprintHash: "clip-hash-1",
});

const finalSceneClip2 = finalSceneClip({
  sceneId: "scene-2",
  asset: sceneClipAsset2,
  fingerprintHash: "clip-hash-2",
  index: 1,
  totalSceneCount: 2,
});

const voiceoverAsset: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-voiceover",
  sceneId: null,
  kind: "voiceover_audio",
  storagePath: "user-1/project-1/run-1/voiceover.mp3",
  contentType: "audio/mpeg",
  fingerprintHash: "voiceover-hash",
};

const joinedScenesAsset: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-joined",
  sceneId: null,
  kind: "joined_scenes",
  storagePath: "user-1/project-1/run-1/joined-scenes.mp4",
  fingerprintHash: "joined-hash",
};

const finalVideoAsset: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-final",
  sceneId: null,
  kind: "final_video",
  storagePath: "user-1/project-1/run-1/final-video.mp4",
  fingerprintHash: "final-hash",
};

const avatarVideoAsset: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-avatar",
  sceneId: null,
  kind: "avatar_video",
  storagePath: "user-1/project-1/run-1/avatar.webm",
  contentType: "video/webm",
  fingerprintHash: "avatar-hash",
};

const avatarMetadataAsset: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-avatar-metadata",
  sceneId: null,
  kind: "avatar_metadata",
  storagePath: "user-1/project-1/run-1/avatar-metadata.json",
  contentType: "application/json",
  fingerprintHash: "avatar-metadata-hash",
};

const avatarMetadata = {
  analysis: {
    sourceWidth: 720,
    sourceHeight: 1280,
    sampledFrameCount: 1,
    alphaThreshold: 16,
    medianBox: { x: 120, y: 100, width: 360, height: 900, right: 480, bottom: 1000 },
    maxBox: { x: 120, y: 100, width: 360, height: 900, right: 480, bottom: 1000 },
    transparentPadding: { left: 120, right: 240, top: 100, bottom: 280 },
    edgeTouchRate: { left: 0, right: 0, top: 0, bottom: 0 },
    cropRisk: { level: "none", reasons: [] },
  },
  overlay: {
    canvas: { width: 1080, height: 1920 },
    size: "medium",
    placement: {
      avatarWidth: 1188,
      anchor: "bottom-right",
      rightMargin: 0,
      bottomMargin: 0,
      basis: "visibleBoundingBox",
      overlayX: "W-792-0",
      overlayY: "H-1650-0",
    },
    ffmpeg: {
      avatarInputCodec: "libvpx-vp9",
      backgroundFilter:
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]",
      avatarScaleFilter: "scale=1188:-1",
      overlayFilter:
        "[1:v]scale=1188:-1[av];[bg][av]overlay=x=W-792-0:y=H-1650-0:format=auto[v]",
      filterComplex:
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];[1:v]scale=1188:-1[av];[bg][av]overlay=x=W-792-0:y=H-1650-0:format=auto[v]",
      outputVideoCodec: "libx264",
      outputAudioCodec: "aac",
      preserveAlpha: true,
    },
  },
  frameChecks: [],
  warnings: [],
} satisfies HeyGenAvatarMetadata;

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn(),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn(),
    downloadListingMedia: vi.fn(),
    uploadRenderAssetJson: vi.fn(),
    uploadRenderAssetBytes: vi
      .fn()
      .mockResolvedValueOnce({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/joined-scenes.mp4",
        contentType: "video/mp4",
      })
      .mockResolvedValueOnce({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/final-video.mp4",
        contentType: "video/mp4",
      }),
    downloadRenderAssetJson: vi.fn(),
    downloadRenderAssetBytes: vi.fn((input) =>
      Promise.resolve(Buffer.from(input.storagePath.includes("voiceover") ? "mp3" : "mp4"))
    ),
    createSignedGeneratedMediaUrl: vi.fn(),
    getAsset: vi.fn(),
    getRenderRun: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    listActiveProjectRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markCancelled: vi.fn(),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn(),
    createAsset: vi.fn().mockResolvedValueOnce(joinedScenesAsset).mockResolvedValueOnce(finalVideoAsset),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn(),
    ...overrides,
  } as TourRenderRepository;
}

function createRenderer(overrides: Partial<FinalVideoRenderer> = {}): FinalVideoRenderer {
  return {
    joinSceneClips: vi.fn(async (input) => {
      const concatBody = await readFile(input.concatFilePath, "utf8");
      if (input.sceneClipPaths.length > 1) {
        expect(concatBody.indexOf("asset-clip-1")).toBeLessThan(concatBody.indexOf("asset-clip-2"));
      }
      await writeFile(input.joinedScenesPath, Buffer.from("joined-mp4"));
      return { metadata: { joiner: "test" } };
    }),
    muxFinalVideo: vi.fn(async (input) => {
      expect(input.voiceoverAudioPath).toMatch(/asset-voiceover/);
      await writeFile(input.finalVideoPath, Buffer.from("final-mp4"));
      return { metadata: { muxer: "test" } };
    }),
    ...overrides,
  };
}

describe("renderFinalVideoStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins ordered scene clips, muxes voiceover, uploads assets, and records the result asset", async () => {
    const repository = createRepository();
    const renderer = createRenderer();

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [
        finalSceneClip1,
        finalSceneClip2,
      ],
      voiceoverAsset,
      renderer,
    });

    expect(result.joinedScenesAsset).toBe(joinedScenesAsset);
    expect(result.finalVideoAsset).toBe(finalVideoAsset);
    expect(vi.mocked(renderer.joinSceneClips).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(renderer.muxFinalVideo).mock.invocationCallOrder[0] ?? 0
    );
    expect(repository.uploadRenderAssetBytes).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "joined_scenes",
        content: Buffer.from("joined-mp4"),
        contentType: "video/mp4",
      })
    );
    expect(repository.uploadRenderAssetBytes).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "final_video",
        content: Buffer.from("final-mp4"),
        contentType: "video/mp4",
      })
    );
    expect(repository.createAsset).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "joined_scenes",
        fingerprint: expect.objectContaining({
          orderedClips: [
            { sceneId: "scene-1", assetId: "asset-clip-1", fingerprintHash: "clip-hash-1" },
            { sceneId: "scene-2", assetId: "asset-clip-2", fingerprintHash: "clip-hash-2" },
          ],
          concatSettings: { safe: 0, copyCodec: true },
        }),
      })
    );
    expect(repository.createAsset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "final_video",
        fingerprint: expect.objectContaining({
          joinedScenesFingerprintHash: result.joinedScenesFingerprintHash,
          voiceover: { assetId: "asset-voiceover", fingerprintHash: "voiceover-hash" },
          avatarOverlay: null,
        }),
        metadata: expect.objectContaining({
          joinedScenesAssetId: "asset-joined",
          voiceoverAssetId: "asset-voiceover",
          avatarOverlay: null,
        }),
      })
    );
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-final",
      assetId: "asset-final",
      usage: "result",
    });
  });

  it("reuses a matching final video fingerprint without changing original provenance", async () => {
    const reusedFinalVideoAsset: TourRenderAsset = {
      ...finalVideoAsset,
      id: "asset-final-reused",
      createdByRunId: "older-run",
    };
    const repository = createRepository({
      findReusableAsset: vi.fn().mockResolvedValue(reusedFinalVideoAsset),
    });
    const renderer = createRenderer();

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1],
      voiceoverAsset,
      renderer,
      options: { reuseExistingAssets: true },
    });

    expect(result.reusedFinalVideo).toBe(true);
    expect(result.finalVideoAsset).toBe(reusedFinalVideoAsset);
    expect(result.joinedScenesAsset).toBeNull();
    expect(reusedFinalVideoAsset.createdByRunId).toBe("older-run");
    expect(renderer.joinSceneClips).not.toHaveBeenCalled();
    expect(renderer.muxFinalVideo).not.toHaveBeenCalled();
    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-final",
      assetId: "asset-final-reused",
      usage: "reused",
    });
  });

  it("reuses matching joined scenes before muxing the final video", async () => {
    const reusedJoinedScenesAsset: TourRenderAsset = {
      ...joinedScenesAsset,
      id: "asset-joined-reused",
      createdByRunId: "older-run",
    };
    const repository = createRepository({
      findReusableAsset: vi.fn((input) =>
        Promise.resolve(input.kind === "joined_scenes" ? reusedJoinedScenesAsset : null)
      ),
      uploadRenderAssetBytes: vi.fn().mockResolvedValue({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/final-video.mp4",
        contentType: "video/mp4",
      }),
      createAsset: vi.fn().mockResolvedValue(finalVideoAsset),
    });
    const renderer = createRenderer();

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1],
      voiceoverAsset,
      renderer,
      options: { reuseExistingAssets: true },
    });

    expect(result.reusedJoinedScenes).toBe(true);
    expect(result.joinedScenesAsset).toBe(reusedJoinedScenesAsset);
    expect(renderer.joinSceneClips).not.toHaveBeenCalled();
    expect(renderer.muxFinalVideo).toHaveBeenCalled();
    expect(repository.downloadRenderAssetBytes).not.toHaveBeenCalledWith({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/scene-clip-1.mp4",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-final",
      assetId: "asset-joined-reused",
      usage: "reused",
    });
  });

  it("overlays avatar video during final mux when avatar assets are provided", async () => {
    const repository = createRepository({
      createAsset: vi.fn().mockResolvedValueOnce(joinedScenesAsset).mockResolvedValueOnce(finalVideoAsset),
    });
    const renderer = createRenderer({
      muxFinalVideo: vi.fn(async (input) => {
        expect(input.avatarVideoPath).toMatch(/asset-avatar/);
        expect(input.avatarOverlay?.ffmpeg.filterComplex).toContain("overlay=x=W-792-0");
        await writeFile(input.finalVideoPath, Buffer.from("final-avatar-mp4"));
        return { metadata: { muxer: "avatar-test" } };
      }),
    });

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1],
      voiceoverAsset,
      avatarOverlay: {
        avatarAsset: avatarVideoAsset,
        metadataAsset: avatarMetadataAsset,
        metadata: avatarMetadata,
      },
      renderer,
    });

    expect(result.finalVideoFingerprint.avatarOverlay).toMatchObject({
      assetId: "asset-avatar",
      fingerprintHash: "avatar-hash",
      metadataAssetId: "asset-avatar-metadata",
      metadataFingerprintHash: "avatar-metadata-hash",
    });
    expect(repository.createAsset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "final_video",
        metadata: expect.objectContaining({
          avatarOverlay: expect.objectContaining({ assetId: "asset-avatar" }),
        }),
      })
    );
  });

  it("does not reuse the final video when reuse is disabled", async () => {
    const repository = createRepository({
      findReusableAsset: vi.fn().mockResolvedValue(finalVideoAsset),
    });
    const renderer = createRenderer();

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1],
      voiceoverAsset,
      renderer,
      options: { reuseExistingAssets: false },
    });

    expect(result.reusedFinalVideo).toBe(false);
    expect(repository.findReusableAsset).not.toHaveBeenCalled();
    expect(renderer.joinSceneClips).toHaveBeenCalled();
    expect(renderer.muxFinalVideo).toHaveBeenCalled();
  });

  it("keeps a hard-cut join path available when scene transitions are disabled", async () => {
    const repository = createRepository();
    const renderer = createRenderer({
      joinSceneClips: vi.fn(async (input) => {
        expect(input.transitionSettings.enabled).toBe(false);
        await writeFile(input.joinedScenesPath, Buffer.from("joined-hard-cut-mp4"));
        return { metadata: { joiner: "hard-cut-test" } };
      }),
    });

    const result = await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1, finalSceneClip2],
      voiceoverAsset,
      renderer,
      options: { sceneTransitions: { enabled: false } },
    });

    expect(result.joinedScenesFingerprint.transitionSettings.enabled).toBe(false);
    expect(renderer.joinSceneClips).toHaveBeenCalled();
  });

  it("fails before joining when a scene clip is shorter than its requested handle duration", async () => {
    const repository = createRepository();
    const renderer = createRenderer();

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [
          finalSceneClip({
            sceneId: "scene-1",
            asset: sceneClipAsset1,
            fingerprintHash: "clip-hash-1",
            durationSeconds: 4,
            requestedDurationSeconds: 4.5,
            outgoingHandleSeconds: 0.5,
          }),
        ],
        renderer,
        durationProbe: vi.fn().mockResolvedValue(4),
      })
    ).rejects.toMatchObject({
      code: "CONCAT_FAILED",
    } satisfies Partial<TourFinalRenderError>);
    expect(renderer.joinSceneClips).not.toHaveBeenCalled();
    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
  });

  it("fails before muxing when joined-scenes duration drifts from the target sum", async () => {
    const repository = createRepository();
    const renderer = createRenderer();

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [finalSceneClip1, finalSceneClip2],
        renderer,
        durationProbe: vi
          .fn()
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(7),
      })
    ).rejects.toMatchObject({
      code: "CONCAT_FAILED",
    } satisfies Partial<TourFinalRenderError>);
    expect(renderer.joinSceneClips).toHaveBeenCalled();
    expect(renderer.muxFinalVideo).not.toHaveBeenCalled();
  });

  it("fails before upload when concat fails", async () => {
    const repository = createRepository();

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [finalSceneClip1],
        renderer: createRenderer({ joinSceneClips: vi.fn().mockRejectedValue(new Error("concat")) }),
      })
    ).rejects.toMatchObject({
      code: "CONCAT_FAILED",
    } satisfies Partial<TourFinalRenderError>);
    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("preserves the uploaded joined-scenes asset when mux fails", async () => {
    const repository = createRepository();

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [finalSceneClip1],
        renderer: createRenderer({ muxFinalVideo: vi.fn().mockRejectedValue(new Error("mux")) }),
      })
    ).rejects.toMatchObject({
      code: "MUX_FAILED",
    } satisfies Partial<TourFinalRenderError>);
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "joined_scenes" })
    );
    expect(repository.createAsset).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "final_video" })
    );
  });

  it("does not record joined-scenes asset when upload fails", async () => {
    const repository = createRepository({
      uploadRenderAssetBytes: vi.fn().mockResolvedValueOnce(null),
    });

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [finalSceneClip1],
        renderer: createRenderer(),
      })
    ).rejects.toMatchObject({
      code: "JOINED_SCENES_UPLOAD_FAILED",
    } satisfies Partial<TourFinalRenderError>);
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("cleans scratch files after completion", async () => {
    const repository = createRepository();
    let joinedScenesPath = "";
    const renderer = createRenderer({
      joinSceneClips: vi.fn(async (input) => {
        joinedScenesPath = input.joinedScenesPath;
        await writeFile(input.joinedScenesPath, Buffer.from("joined-mp4"));
        return {};
      }),
      muxFinalVideo: vi.fn(async (input) => {
        await writeFile(input.finalVideoPath, Buffer.from("final-mp4"));
        return {};
      }),
    });

    await renderFinalVideoStage({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-final",
      repository,
      clips: [finalSceneClip1],
      renderer,
    });

    await expect(access(joinedScenesPath)).rejects.toThrow();
  });
});

describe("final render fingerprints", () => {
  it("include ordered clip identity, voiceover identity, mux settings, preset, and avatar overlay identity", () => {
    const joined = buildJoinedScenesFingerprint({
      clips: [
        finalSceneClip1,
        finalSceneClip2,
      ],
      concatSettings: { safe: 0, copyCodec: true },
      transitionSettings: resolveTourSceneTransitionSettings(),
    });
    const final = buildFinalVideoFingerprint({
      joinedScenesFingerprintHash: "joined-hash",
      voiceoverAsset,
      avatarOverlay: {
        avatarAsset: avatarVideoAsset,
        metadataAsset: avatarMetadataAsset,
        metadata: avatarMetadata,
      },
      muxSettings: {
        width: 1080,
        height: 1920,
        videoCodec: "libx264",
        audioCodec: "aac",
        preset: "medium",
        crf: 20,
        audioBitrate: "192k",
      },
      outputPreset: "vertical_1080p_h264_aac",
    });

    expect(joined.orderedClips.map((clip) => clip.assetId)).toEqual([
      "asset-clip-1",
      "asset-clip-2",
    ]);
    expect(final).toMatchObject({
      joinedScenesFingerprintHash: "joined-hash",
      voiceover: { assetId: "asset-voiceover", fingerprintHash: "voiceover-hash" },
      muxSettings: { width: 1080, height: 1920 },
      outputPreset: "vertical_1080p_h264_aac",
      avatarOverlay: { assetId: "asset-avatar", metadataAssetId: "asset-avatar-metadata" },
    });
    expect(joined.transitionSettings).toMatchObject({
      enabled: true,
      durationSeconds: 0.5,
      effect: "swipe-on-top",
    });
    expect(joined.expectedDurationSeconds).toBe(8);
    expect(joined.clipHandlePlans).toEqual([
      expect.objectContaining({ sceneId: "scene-1", requestedDurationSeconds: 4 }),
      expect.objectContaining({ sceneId: "scene-2", requestedDurationSeconds: 4 }),
    ]);
  });
});
