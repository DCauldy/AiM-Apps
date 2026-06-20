import { access, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourSceneClipRenderError,
  buildSceneClipFingerprint,
  createOpenRouterImageToVideoProvider,
  renderSceneClipsStage,
  resolveSceneClipStageOptions,
  type ImageToVideoProvider,
  type ProviderSceneClipNormalizer,
  type SceneClipBatchItem,
  type SceneClipRenderer,
} from "./tour-scene-clips";
import { buildOpenRouterSceneClipPrompt } from "./tour-scene-clip-openrouter";
import type { RenderableTourProject, TourRenderAsset, TourRenderRepository } from "./tour-render.repository";
import { planSceneClipHandles, resolveTourSceneTransitionSettings } from "./tour-render-transitions";
import type { SceneDuration } from "./tour-transitions";

const primarySourcePhoto = {
  id: "photo-1",
  storagePath: "user-1/project-1/kitchen.jpg",
  fileName: "kitchen.jpg",
  contentType: "image/jpeg" as const,
  byteSize: 123,
  width: 1200,
  height: 800,
  priority: 0,
};

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
      authoritativePhoto: primarySourcePhoto,
      sourcePhotos: [primarySourcePhoto],
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

const multiSceneProject: RenderableTourProject = {
  ...project,
  scenes: [
    project.scenes[0]!,
    {
      ...project.scenes[0]!,
      id: "scene-2",
      title: "Patio",
      sortOrder: 2,
      authoritativePhoto: {
        ...project.scenes[0]!.authoritativePhoto,
        id: "photo-2",
        storagePath: "user-1/project-1/patio.jpg",
        fileName: "patio.jpg",
      },
      sourcePhotos: [
        {
          ...project.scenes[0]!.authoritativePhoto,
          id: "photo-2",
          storagePath: "user-1/project-1/patio.jpg",
          fileName: "patio.jpg",
        },
      ],
    },
    {
      ...project.scenes[0]!,
      id: "scene-3",
      title: "Bedroom",
      sortOrder: 3,
      authoritativePhoto: {
        ...project.scenes[0]!.authoritativePhoto,
        id: "photo-3",
        storagePath: "user-1/project-1/bedroom.jpg",
        fileName: "bedroom.jpg",
      },
      sourcePhotos: [
        {
          ...project.scenes[0]!.authoritativePhoto,
          id: "photo-3",
          storagePath: "user-1/project-1/bedroom.jpg",
          fileName: "bedroom.jpg",
        },
      ],
    },
  ],
};

const multiSceneDurations: SceneDuration[] = [
  durations[0]!,
  {
    sceneId: "scene-2",
    title: "Patio",
    durationSeconds: 5,
    offsets: { from: 4000, to: 9000 },
  },
  {
    sceneId: "scene-3",
    title: "Bedroom",
    durationSeconds: 6,
    offsets: { from: 9000, to: 15000 },
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
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
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

function createProviderNormalizer(): ProviderSceneClipNormalizer {
  return {
    normalizeSceneClip: vi.fn(async (input) => {
      await writeFile(input.outputVideoPath, Buffer.from("normalized-provider-mp4"));
      return { metadata: { normalizer: "test-normalizer" } };
    }),
  };
}

describe("renderSceneClipsStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TOURS_RENDER_MODE;
  });

  it("uses TOURS_RENDER_MODE when stage options omit renderMode", () => {
    process.env.TOURS_RENDER_MODE = "provider_image_to_video";

    expect(resolveSceneClipStageOptions()).toEqual(
      expect.objectContaining({
        renderMode: "provider_image_to_video",
        providerModelId: "kwaivgi/kling-v3.0-std",
        includeSecondarySourceImages: true,
      })
    );
    expect(resolveSceneClipStageOptions({ renderMode: "ken_burns_ffmpeg" }).renderMode).toBe(
      "ken_burns_ffmpeg"
    );
    expect(
      resolveSceneClipStageOptions({ includeSecondarySourceImages: false })
        .includeSecondarySourceImages
    ).toBe(false);
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

  it("records mixed reused and created scene clip assets in one run", async () => {
    const reusedScene2Asset: TourRenderAsset = {
      ...sceneClipAsset,
      id: "asset-scene-2-reused",
      createdByRunId: "older-run",
      sceneId: "scene-2",
    };
    const repository = createRepository({
      findReusableAsset: vi.fn((input) =>
        Promise.resolve(input.sceneId === "scene-2" ? reusedScene2Asset : null)
      ),
      createAsset: vi.fn((input) =>
        Promise.resolve({
          ...sceneClipAsset,
          id: `asset-${input.sceneId}-created`,
          sceneId: input.sceneId ?? null,
          storagePath: input.storagePath ?? null,
          fingerprintHash: input.fingerprintHash,
          fingerprint: input.fingerprint,
        })
      ),
    });
    const renderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        await writeFile(input.outputVideoPath, Buffer.from(`mp4-${input.scene.id}`));
        return {};
      }),
    };

    const result = await renderSceneClipsStage({
      project: multiSceneProject,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations: multiSceneDurations,
      renderer,
      options: { reuseExistingAssets: true, concurrencyLimit: 2 },
    });

    expect(result.clips.map((clip) => ({ sceneId: clip.sceneId, reused: clip.reused }))).toEqual([
      { sceneId: "scene-1", reused: false },
      { sceneId: "scene-2", reused: true },
      { sceneId: "scene-3", reused: false },
    ]);
    expect(renderer.renderSceneClip).toHaveBeenCalledTimes(2);
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-scene-2-reused",
      usage: "reused",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-scene-1-created",
      usage: "created",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-scene-3-created",
      usage: "created",
    });
    expect(reusedScene2Asset.createdByRunId).toBe("older-run");
  });

  it("delegates scene rendering to a batch runner when provided", async () => {
    const repository = createRepository();
    const batchRunner = vi.fn(async (items) =>
      items
        .map((item: SceneClipBatchItem) => ({
          index: item.index,
          clip: {
            sceneId: item.scene.id,
            durationSeconds: item.duration.durationSeconds,
            asset: {
              ...sceneClipAsset,
              id: `asset-${item.scene.id}`,
              sceneId: item.scene.id,
            },
            reused: false,
            fingerprintHash: `hash-${item.scene.id}`,
            fingerprint: {},
            requestedDurationSeconds: item.handlePlan.requestedDurationSeconds,
            handlePlan: item.handlePlan,
          },
        }))
        .reverse()
    );
    const onClipCompleted = vi.fn();

    const result = await renderSceneClipsStage({
      project: multiSceneProject,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations: multiSceneDurations,
      batchRunner,
      onClipCompleted,
    });

    expect(batchRunner).toHaveBeenCalledWith([
      expect.objectContaining({ index: 0, scene: expect.objectContaining({ id: "scene-1" }) }),
      expect.objectContaining({ index: 1, scene: expect.objectContaining({ id: "scene-2" }) }),
      expect.objectContaining({ index: 2, scene: expect.objectContaining({ id: "scene-3" }) }),
    ]);
    expect(result.clips.map((clip) => clip.sceneId)).toEqual(["scene-1", "scene-2", "scene-3"]);
    expect(repository.downloadListingMedia).not.toHaveBeenCalled();
    expect(onClipCompleted).toHaveBeenLastCalledWith({ completedCount: 3, totalCount: 3 });
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

  it("renders missing scene clips with bounded concurrency", async () => {
    const repository = createRepository({
      uploadRenderAssetBytes: vi.fn((input) =>
        Promise.resolve({
          storageBucket: "tours-generated-media" as const,
          storagePath: `user-1/project-1/run-1/${input.kind}.mp4`,
          contentType: input.contentType,
        })
      ),
      createAsset: vi.fn((input) =>
        Promise.resolve({
          ...sceneClipAsset,
          id: `asset-${input.sceneId}`,
          sceneId: input.sceneId ?? null,
          storagePath: input.storagePath ?? null,
          fingerprintHash: input.fingerprintHash,
          fingerprint: input.fingerprint,
        })
      ),
    });
    let activeRenderCount = 0;
    let maxActiveRenderCount = 0;
    const renderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        activeRenderCount += 1;
        maxActiveRenderCount = Math.max(maxActiveRenderCount, activeRenderCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        await writeFile(input.outputVideoPath, Buffer.from(`mp4-${input.scene.id}`));
        activeRenderCount -= 1;
        return {};
      }),
    };

    const result = await renderSceneClipsStage({
      project: multiSceneProject,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations: multiSceneDurations,
      renderer,
      options: { reuseExistingAssets: false, concurrencyLimit: 2 },
    });

    expect(maxActiveRenderCount).toBeLessThanOrEqual(2);
    expect(result.clips.map((clip) => clip.sceneId)).toEqual(["scene-1", "scene-2", "scene-3"]);
    expect(result.completedCount).toBe(3);
    expect(renderer.renderSceneClip).toHaveBeenCalledTimes(3);
  });

  it("imports provider output into generated media without persisting provider URLs", async () => {
    const repository = createRepository();
    const providerNormalizer = createProviderNormalizer();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://provider.example/output.mp4",
        metadata: { providerJobId: "job-1" },
      }),
    };
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(Buffer.from("provider-mp4"), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }))
    );

    await renderSceneClipsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      provider,
      providerNormalizer,
      fetcher,
      durationProbe: vi.fn().mockResolvedValue(4),
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
        durationSeconds: 4,
      })
    );
    expect(fetcher).toHaveBeenCalledWith("https://provider.example/output.mp4", {
      headers: undefined,
    });
    expect(providerNormalizer.normalizeSceneClip).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ width: 1080, height: 1920, fps: 30 }),
        ffmpegPath: "ffmpeg",
      })
    );
    expect(repository.uploadRenderAssetBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        content: Buffer.from("normalized-provider-mp4"),
        contentType: "video/mp4",
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/scene-clip.mp4",
        metadata: expect.objectContaining({
          provider: "openrouter",
          modelId: "openrouter/kling",
          providerJobId: "job-1",
          normalizedProviderOutput: true,
          normalizer: "test-normalizer",
        }),
      })
    );
    expect(repository.createAsset).not.toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: "https://provider.example/output.mp4",
      })
    );
  });

  it("passes non-authoritative source photos as secondary provider references", async () => {
    const secondaryPhoto = {
      ...primarySourcePhoto,
      id: "photo-2",
      storagePath: "user-1/project-1/kitchen-detail.jpg",
      fileName: "kitchen-detail.jpg",
      priority: 1,
    };
    const projectWithSecondaryPhotos: RenderableTourProject = {
      ...project,
      scenes: [
        {
          ...project.scenes[0]!,
          sourcePhotos: [project.scenes[0]!.authoritativePhoto, secondaryPhoto],
        },
      ],
    };
    const repository = createRepository({
      createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
        {
          storagePath: "user-1/project-1/kitchen.jpg",
          signedUrl: "https://signed.example/kitchen.jpg",
        },
        {
          storagePath: "user-1/project-1/kitchen-detail.jpg",
          signedUrl: "https://signed.example/kitchen-detail.jpg",
        },
      ]),
    });
    const providerNormalizer = createProviderNormalizer();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://provider.example/output.mp4",
      }),
    };
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(Buffer.from("provider-mp4"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })
      )
    );

    await renderSceneClipsStage({
      project: projectWithSecondaryPhotos,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      provider,
      providerNormalizer,
      fetcher,
      durationProbe: vi.fn().mockResolvedValue(4),
      options: {
        renderMode: "provider_image_to_video",
        providerModelId: "openrouter/kling",
        reuseExistingAssets: false,
      },
    });

    expect(repository.createSignedSourcePhotoUrls).toHaveBeenCalledWith({
      storagePaths: [
        "user-1/project-1/kitchen.jpg",
        "user-1/project-1/kitchen-detail.jpg",
      ],
      expiresInSeconds: 600,
    });
    expect(provider.renderSceneClip).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImageUrl: "https://signed.example/kitchen.jpg",
        secondarySourceImageUrls: ["https://signed.example/kitchen-detail.jpg"],
      })
    );
  });

  it("uses provider download headers when importing authenticated image-to-video output", async () => {
    const repository = createRepository();
    const providerNormalizer = createProviderNormalizer();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://openrouter.ai/api/v1/videos/job-1/content?index=0",
        downloadHeaders: { Authorization: "Bearer openrouter-key" },
      }),
    };
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(Buffer.from("provider-mp4"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })
      )
    );

    await renderSceneClipsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations,
      provider,
      providerNormalizer,
      fetcher,
      durationProbe: vi.fn().mockResolvedValue(4),
      options: {
        renderMode: "provider_image_to_video",
        providerModelId: "openrouter/kling",
        reuseExistingAssets: false,
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/videos/job-1/content?index=0",
      {
        headers: { Authorization: "Bearer openrouter-key" },
      }
    );
  });

  it("submits and polls OpenRouter image-to-video jobs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "video-job-1", status: "queued" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "video-job-1",
            status: "completed",
            unsigned_urls: ["https://provider.example/video.mp4"],
          }),
          { status: 200 }
        )
      );
    const provider = createOpenRouterImageToVideoProvider({
      apiKey: "openrouter-key",
      fetcher,
      pollIntervalMs: 0,
      maxPollAttempts: 1,
    });

    const result = await provider.renderSceneClip({
      scene: project.scenes[0]!,
      sourceImageUrl: "https://signed.example/kitchen.jpg",
      secondarySourceImageUrls: ["https://signed.example/kitchen-detail.jpg"],
      durationSeconds: 4.4,
      modelId: "kwaivgi/kling-v3.0-std",
      settings: {
        width: 1080,
        height: 1920,
        fps: 30,
        crf: 18,
        fadeSeconds: 0.25,
        cropMode: "cover",
      },
    });

    expect(result.outputUrl).toBe("https://provider.example/video.mp4");
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://openrouter.ai/api/v1/videos",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"model\":\"kwaivgi/kling-v3.0-std\""),
      })
    );
    const submitHeaders = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(submitHeaders.get("Authorization")).toBe("Bearer openrouter-key");
    expect(submitHeaders.get("X-OpenRouter-Title")).toBe("AiM Tours");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({
        duration: 5,
        input_references: [
          {
            type: "image_url",
            image_url: { url: "https://signed.example/kitchen-detail.jpg" },
          },
        ],
      })
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).prompt).toBe(
      buildOpenRouterSceneClipPrompt({
        scene: project.scenes[0]!,
        sourceImageUrl: "https://signed.example/kitchen.jpg",
        secondarySourceImageUrls: ["https://signed.example/kitchen-detail.jpg"],
        durationSeconds: 4.4,
        modelId: "kwaivgi/kling-v3.0-std",
        settings: {
          width: 1080,
          height: 1920,
          fps: 30,
          crf: 18,
          fadeSeconds: 0.25,
          cropMode: "cover",
        },
      })
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).prompt).toContain(
      "Secondary reference images are provided only as additional room/property context"
    );
    expect(result.metadata).toMatchObject({
      requestedDurationSeconds: 4.4,
      providerRequestedDurationSeconds: 5,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://openrouter.ai/api/v1/videos/video-job-1",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const pollHeaders = fetcher.mock.calls[1]?.[1]?.headers as Headers;
    expect(pollHeaders.get("Authorization")).toBe("Bearer openrouter-key");
    expect(pollHeaders.get("X-OpenRouter-Title")).toBe("AiM Tours");
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
  it("plans fixed incoming and outgoing transition handles for first, middle, and last scenes", () => {
    expect(
      planSceneClipHandles({
        durations: multiSceneDurations,
        transitionSettings: resolveTourSceneTransitionSettings(),
      })
    ).toEqual([
      expect.objectContaining({
        sceneId: "scene-1",
        targetDurationSeconds: 4,
        requestedDurationSeconds: 4.5,
        incomingHandleSeconds: 0,
        outgoingHandleSeconds: 0.5,
      }),
      expect.objectContaining({
        sceneId: "scene-2",
        targetDurationSeconds: 5,
        requestedDurationSeconds: 6,
        incomingHandleSeconds: 0.5,
        outgoingHandleSeconds: 0.5,
      }),
      expect.objectContaining({
        sceneId: "scene-3",
        targetDurationSeconds: 6,
        requestedDurationSeconds: 6.5,
        incomingHandleSeconds: 0.5,
        outgoingHandleSeconds: 0,
      }),
    ]);
  });

  it("requests provider clips with handle duration and stores transition audit metadata", async () => {
    const repository = createRepository({
      createSignedSourcePhotoUrls: vi.fn((input) =>
        Promise.resolve(
          input.storagePaths.map((storagePath: string) => ({
            storagePath,
            signedUrl: `https://signed.example/${storagePath.split("/").at(-1)}`,
          }))
        )
      ),
    });
    const providerNormalizer = createProviderNormalizer();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://provider.example/output.mp4",
      }),
    };
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(Buffer.from("provider-mp4"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })
      )
    );

    const result = await renderSceneClipsStage({
      project: multiSceneProject,
      repository,
      runId: "run-1",
      userId: "user-1",
      durations: multiSceneDurations,
      provider,
      providerNormalizer,
      fetcher,
      durationProbe: vi
        .fn()
        .mockResolvedValueOnce(4.5)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(6.5),
      options: {
        renderMode: "provider_image_to_video",
        providerModelId: "openrouter/kling",
        reuseExistingAssets: false,
      },
    });

    expect(provider.renderSceneClip).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ durationSeconds: 4.5 })
    );
    expect(provider.renderSceneClip).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ durationSeconds: 6 })
    );
    expect(provider.renderSceneClip).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ durationSeconds: 6.5 })
    );
    expect(result.clips.map((clip) => clip.requestedDurationSeconds)).toEqual([4.5, 6, 6.5]);
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          transition: expect.objectContaining({
            settings: expect.objectContaining({
              durationSeconds: 0.5,
              effect: "swipe-on-top",
            }),
          }),
        }),
      })
    );
  });

  it("fails provider rendering when the normalized output is shorter than requested handles", async () => {
    const repository = createRepository({
      createSignedSourcePhotoUrls: vi.fn((input) =>
        Promise.resolve(
          input.storagePaths.map((storagePath: string) => ({
            storagePath,
            signedUrl: `https://signed.example/${storagePath.split("/").at(-1)}`,
          }))
        )
      ),
    });
    const providerNormalizer = createProviderNormalizer();
    const provider: ImageToVideoProvider = {
      renderSceneClip: vi.fn().mockResolvedValue({
        outputUrl: "https://provider.example/output.mp4",
      }),
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(Buffer.from("provider-mp4"), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );

    await expect(
      renderSceneClipsStage({
        project: multiSceneProject,
        repository,
        runId: "run-1",
        userId: "user-1",
        durations: multiSceneDurations,
        provider,
        providerNormalizer,
        fetcher,
        durationProbe: vi.fn().mockResolvedValue(3),
        options: {
          renderMode: "provider_image_to_video",
          providerModelId: "openrouter/kling",
          reuseExistingAssets: false,
        },
      })
    ).rejects.toMatchObject({
      code: "SCENE_CLIP_DURATION_INVALID",
    } satisfies Partial<TourSceneClipRenderError>);
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("includes scene, source photo identity, duration, renderer policy, settings, and adapter version", () => {
    const handlePlan = planSceneClipHandles({
      durations,
      transitionSettings: resolveTourSceneTransitionSettings(),
    })[0]!;
    const fingerprint = buildSceneClipFingerprint({
      scene: project.scenes[0]!,
      durationSeconds: 4,
      handlePlan,
      sceneTransitions: resolveTourSceneTransitionSettings(),
      renderMode: "provider_image_to_video",
      providerModelId: "openrouter/kling",
      includeSecondarySourceImages: true,
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
