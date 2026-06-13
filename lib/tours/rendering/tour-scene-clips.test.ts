import { access, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourSceneClipRenderError,
  buildSceneClipFingerprint,
  renderSceneClipsStage,
  type ImageToVideoProvider,
  type SceneClipRenderer,
} from "./tour-scene-clips";
import type {
  RenderableTourProject,
  TourRenderAsset,
  TourRenderRepository,
} from "./tour-render.repository";
import type { SceneDuration } from "./tour-transitions";

const project: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Demo Listing",
    propertyAddress: "123 Main St",
    listingUrl: null,
    tourType: "tour_video",
  },
  scenes: [
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: {
        id: "photo-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        width: 1200,
        height: 800,
      },
      proofedFacts: [],
    },
  ],
};

const durations: SceneDuration[] = [
  {
    sceneId: "scene-1",
    title: "Kitchen",
    durationSeconds: 4,
    offsets: { from: 0, to: 4000 },
  },
];

const sceneClipAsset: TourRenderAsset = {
  id: "asset-clip",
  createdByRunId: "run-1",
  projectId: "project-1",
  sceneId: "scene-1",
  kind: "scene_clip",
  storageBucket: "tours-generated-media",
  storagePath: "user-1/project-1/run-1/scene-clip.mp4",
  contentType: "video/mp4",
  fingerprintHash: "hash",
  fingerprint: {},
  reusable: true,
  metadata: {},
  createdAt: "2026-06-13T12:00:00.000Z",
};

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn(),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
      {
        storagePath: "user-1/project-1/kitchen.jpg",
        signedUrl: "https://signed.example/kitchen.jpg",
      },
    ]),
    downloadListingMedia: vi.fn().mockResolvedValue(Buffer.from("jpg-bytes")),
    uploadRenderAssetJson: vi.fn(),
    uploadRenderAssetBytes: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/scene-clip.mp4",
      contentType: "video/mp4",
    }),
    downloadRenderAssetJson: vi.fn(),
    getRenderRun: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn(),
    createAsset: vi.fn().mockResolvedValue(sceneClipAsset),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

describe("renderSceneClipsStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects reusable scene clips when fingerprints match", async () => {
    const repository = createRepository({
      findReusableAsset: vi.fn().mockResolvedValue(sceneClipAsset),
    });
    const onClipCompleted = vi.fn();

    const result = await renderSceneClipsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      onClipCompleted,
    });

    expect(result.clips).toEqual([
      expect.objectContaining({
        sceneId: "scene-1",
        asset: sceneClipAsset,
        reused: true,
      }),
    ]);
    expect(repository.downloadListingMedia).not.toHaveBeenCalled();
    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-clip",
      usage: "reused",
    });
    expect(onClipCompleted).toHaveBeenCalledWith({ completedCount: 1, totalCount: 1 });
  });

  it("renders Ken Burns clips from downloaded source photos and records assets after upload", async () => {
    const repository = createRepository();
    let sourceImagePath = "";
    let outputVideoPath = "";
    const renderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        sourceImagePath = input.sourceImagePath;
        outputVideoPath = input.outputVideoPath;
        expect(input.ffmpegPath).toBe("ffmpeg");
        expect(input.ffprobePath).toBe("ffprobe");
        await writeFile(input.outputVideoPath, Buffer.from("mp4-bytes"));
        return { metadata: { renderer: "test-renderer" } };
      }),
    };

    const result = await renderSceneClipsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      renderer,
      options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: false },
    });

    expect(result.completedCount).toBe(1);
    expect(repository.downloadListingMedia).toHaveBeenCalledWith({
      storagePath: "user-1/project-1/kitchen.jpg",
    });
    expect(repository.uploadRenderAssetBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "scene_clip",
        content: Buffer.from("mp4-bytes"),
        contentType: "video/mp4",
        extension: "mp4",
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        sceneId: "scene-1",
        kind: "scene_clip",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/scene-clip.mp4",
        reusable: true,
        metadata: expect.objectContaining({
          renderMode: "ken_burns_ffmpeg",
          renderer: "test-renderer",
        }),
      })
    );
    await expect(access(sourceImagePath)).rejects.toThrow();
    await expect(access(outputVideoPath)).rejects.toThrow();
  });

  it("imports provider output into generated media without persisting provider URLs", async () => {
    const repository = createRepository();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://provider.example/output.mp4",
        metadata: { providerJobId: "job-1" },
      }),
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(Buffer.from("provider-mp4"), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );

    await renderSceneClipsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      provider,
      fetcher,
      options: {
        renderMode: "provider_image_to_video",
        providerModelId: "openrouter/kling",
        reuseExistingAssets: false,
      },
    });

    expect(provider.renderSceneClip).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImageUrl: "https://signed.example/kitchen.jpg",
        modelId: "openrouter/kling",
      })
    );
    expect(fetcher).toHaveBeenCalledWith("https://provider.example/output.mp4");
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/scene-clip.mp4",
        metadata: expect.objectContaining({
          provider: "openrouter",
          modelId: "openrouter/kling",
          providerJobId: "job-1",
        }),
      })
    );
    expect(repository.createAsset).not.toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: "https://provider.example/output.mp4",
      })
    );
  });

  it("fails before recording an asset when upload fails", async () => {
    const repository = createRepository({
      uploadRenderAssetBytes: vi.fn().mockResolvedValue(null),
    });
    const renderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        await writeFile(input.outputVideoPath, Buffer.from("mp4-bytes"));
        return {};
      }),
    };

    await expect(
      renderSceneClipsStage({
        project,
        repository,
        runId: "run-1",
        userId: "user-1",
        durations,
        renderer,
        options: { reuseExistingAssets: false },
      })
    ).rejects.toMatchObject({
      code: "SCENE_CLIP_UPLOAD_FAILED",
    } satisfies Partial<TourSceneClipRenderError>);
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("cleans scratch files when the renderer fails", async () => {
    const repository = createRepository();
    let sourceImagePath = "";
    const renderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        sourceImagePath = input.sourceImagePath;
        throw new Error("ffmpeg failed");
      }),
    };

    await expect(
      renderSceneClipsStage({
        project,
        repository,
        runId: "run-1",
        userId: "user-1",
        durations,
        renderer,
        options: { reuseExistingAssets: false },
      })
    ).rejects.toMatchObject({
      code: "SCENE_CLIP_RENDER_FAILED",
    } satisfies Partial<TourSceneClipRenderError>);
    await expect(access(sourceImagePath)).rejects.toThrow();
  });
});

describe("buildSceneClipFingerprint", () => {
  it("includes scene, source photo identity, duration, renderer policy, settings, and adapter version", () => {
    const fingerprint = buildSceneClipFingerprint({
      scene: project.scenes[0]!,
      durationSeconds: 4,
      renderMode: "provider_image_to_video",
      providerModelId: "openrouter/kling",
      renderSettings: {
        width: 1080,
        height: 1920,
        fps: 30,
        crf: 18,
        fadeSeconds: 0.25,
        cropMode: "cover",
      },
    });

    expect(fingerprint).toMatchObject({
      scene: { id: "scene-1", cameraMotion: "slow_push" },
      sourcePhoto: {
        id: "photo-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        byteSize: 123,
      },
      durationSeconds: 4,
      renderMode: "provider_image_to_video",
      provider: { name: "openrouter", modelId: "openrouter/kling" },
      adapterVersion: expect.any(String),
      renderSettings: expect.objectContaining({ width: 1080, height: 1920 }),
    });
  });
});
