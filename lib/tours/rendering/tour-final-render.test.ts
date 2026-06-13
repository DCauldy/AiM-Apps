import { access, readFile, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourFinalRenderError,
  buildFinalVideoFingerprint,
  buildJoinedScenesFingerprint,
  renderFinalVideoStage,
  type FinalVideoRenderer,
} from "./tour-final-render";
import type { TourRenderAsset, TourRenderRepository } from "./tour-render.repository";

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
  createdAt: "2026-06-13T12:00:00.000Z",
};

const sceneClipAsset2: TourRenderAsset = {
  ...sceneClipAsset1,
  id: "asset-clip-2",
  sceneId: "scene-2",
  storagePath: "user-1/project-1/run-1/scene-clip-2.mp4",
  fingerprintHash: "clip-hash-2",
};

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
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
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
        { sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" },
        { sceneId: "scene-2", asset: sceneClipAsset2, fingerprintHash: "clip-hash-2" },
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

  it("fails before upload when concat fails", async () => {
    const repository = createRepository();

    await expect(
      renderFinalVideoStage({
        projectId: "project-1",
        userId: "user-1",
        runId: "run-final",
        repository,
        clips: [{ sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" }],
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
        clips: [{ sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" }],
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
        clips: [{ sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" }],
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
      clips: [{ sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" }],
      renderer,
    });

    await expect(access(joinedScenesPath)).rejects.toThrow();
  });
});

describe("final render fingerprints", () => {
  it("include ordered clip identity, voiceover identity, mux settings, preset, and avatar extension point", () => {
    const joined = buildJoinedScenesFingerprint({
      clips: [
        { sceneId: "scene-1", asset: sceneClipAsset1, fingerprintHash: "clip-hash-1" },
        { sceneId: "scene-2", asset: sceneClipAsset2, fingerprintHash: "clip-hash-2" },
      ],
      concatSettings: { safe: 0, copyCodec: true },
    });
    const final = buildFinalVideoFingerprint({
      joinedScenesFingerprintHash: "joined-hash",
      voiceoverAsset,
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
      avatarOverlay: null,
    });
  });
});
