import { access, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourSceneClipRenderError,
  renderSceneClipsStage,
  resolveSceneClipStageOptions,
  type SceneClipBatchItem,
  type SceneClipRenderer,
} from "./scene-clips";
import type { RenderableTourProject, TourRenderAsset } from "../repositories/tour-render.repository";
import {
  createRepository,
  durations,
  multiSceneProject,
  multiSceneTimings,
  project,
  sceneClipAsset,
} from "./scene-clips.test-helpers";

describe("renderSceneClipsStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TOURS_RENDER_MODE;
  });

  it("defaults to provider image-to-video when stage options omit renderMode", () => {
    expect(resolveSceneClipStageOptions()).toEqual(
      expect.objectContaining({
        renderMode: "provider_image_to_video",
        providerModelId: "kwaivgi/kling-v3.0-std",
        includeSecondarySourceImages: true,
      })
    );

    process.env.TOURS_RENDER_MODE = "ken_burns_ffmpeg";
    expect(resolveSceneClipStageOptions().renderMode).toBe("ken_burns_ffmpeg");
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
      runId: "scene-clips-run",
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
      runId: "scene-clips-run",
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
      runId: "scene-clips-run",
      userId: "user-1",
      durations: multiSceneTimings,
      renderer,
      options: {
        renderMode: "ken_burns_ffmpeg",
        reuseExistingAssets: true,
        concurrencyLimit: 2,
      },
    });

    expect(result.clips.map((clip) => ({ sceneId: clip.sceneId, reused: clip.reused }))).toEqual([
      { sceneId: "scene-1", reused: false },
      { sceneId: "scene-2", reused: true },
      { sceneId: "scene-3", reused: false },
    ]);
    expect(renderer.renderSceneClip).toHaveBeenCalledTimes(2);
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "scene-clips-run",
      assetId: "asset-scene-2-reused",
      usage: "reused",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "scene-clips-run",
      assetId: "asset-scene-1-created",
      usage: "created",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "scene-clips-run",
      assetId: "asset-scene-3-created",
      usage: "created",
    });
    expect(reusedScene2Asset.createdByRunId).toBe("older-run");
  });

  it("carries each saved scene transition effect through clip results and fingerprints", async () => {
    const projectWithTransitions: RenderableTourProject = {
      ...multiSceneProject,
      scenes: multiSceneProject.scenes.map((scene, index) => ({
        ...scene,
        transitionEffect:
          index === 0 ? "fade" : index === 1 ? "cross-dissolve" : "whip-pan",
      })),
    };
    const repository = createRepository({
      createAsset: vi.fn((input) =>
        Promise.resolve({
          ...sceneClipAsset,
          id: `asset-${input.sceneId}`,
          sceneId: input.sceneId ?? null,
          storagePath: input.storagePath ?? null,
          fingerprintHash: input.fingerprintHash,
          fingerprint: input.fingerprint,
          metadata: input.metadata,
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
      project: projectWithTransitions,
      repository,
      runId: "scene-clips-run",
      userId: "user-1",
      durations: multiSceneTimings,
      renderer,
      options: {
        renderMode: "ken_burns_ffmpeg",
        reuseExistingAssets: false,
      },
    });

    expect(result.clips.map((clip) => clip.transitionEffect)).toEqual([
      "fade",
      "cross-dissolve",
      "whip-pan",
    ]);
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: "scene-2",
        fingerprint: expect.objectContaining({
          transition: expect.objectContaining({
            settings: expect.objectContaining({ effect: "cross-dissolve" }),
          }),
        }),
        metadata: expect.objectContaining({
          transitionEffect: "cross-dissolve",
          transition: expect.objectContaining({
            settings: expect.objectContaining({ effect: "cross-dissolve" }),
          }),
        }),
      })
    );
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
      runId: "scene-clips-run",
      userId: "user-1",
      durations: multiSceneTimings,
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
      runId: "scene-clips-run",
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
      runId: "scene-clips-run",
      userId: "user-1",
      durations: multiSceneTimings,
      renderer,
      options: {
        renderMode: "ken_burns_ffmpeg",
        reuseExistingAssets: false,
        concurrencyLimit: 2,
      },
    });

    expect(maxActiveRenderCount).toBeLessThanOrEqual(2);
    expect(result.clips.map((clip) => clip.sceneId)).toEqual(["scene-1", "scene-2", "scene-3"]);
    expect(result.completedCount).toBe(3);
    expect(renderer.renderSceneClip).toHaveBeenCalledTimes(3);
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
        runId: "scene-clips-run",
        userId: "user-1",
        durations,
        renderer,
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: false },
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
        runId: "scene-clips-run",
        userId: "user-1",
        durations,
        renderer,
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: false },
      })
    ).rejects.toMatchObject({
      code: "SCENE_CLIP_RENDER_FAILED",
    } satisfies Partial<TourSceneClipRenderError>);
    await expect(access(sourceImagePath)).rejects.toThrow();
  });
});
