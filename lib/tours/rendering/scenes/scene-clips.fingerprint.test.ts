import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TourSceneClipRenderError,
  buildSceneClipFingerprint,
  renderSceneClipsStage,
  type ImageToVideoProvider,
} from "./scene-clips";
import { planSceneClipTransitionHandles, resolveSceneTransitionEffectSettings } from "../transitions/scene-transition-effects";
import {
  createProviderNormalizer,
  createRepository,
  durations,
  multiSceneProject,
  multiSceneTimings,
  project,
} from "./scene-clips.test-helpers";

describe("buildSceneClipFingerprint", () => {
  it("plans fixed incoming and outgoing transition handles for first, middle, and last scenes", () => {
    expect(
      planSceneClipTransitionHandles({
        durations: multiSceneTimings,
        transitionSettings: resolveSceneTransitionEffectSettings(),
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
      runId: "scene-clips-run",
      userId: "user-1",
      durations: multiSceneTimings,
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
        runId: "scene-clips-run",
        userId: "user-1",
        durations: multiSceneTimings,
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
    const handlePlan = planSceneClipTransitionHandles({
      durations,
      transitionSettings: resolveSceneTransitionEffectSettings(),
    })[0]!;
    const fingerprint = buildSceneClipFingerprint({
      scene: project.scenes[0]!,
      durationSeconds: 4,
      handlePlan,
      sceneTransitions: resolveSceneTransitionEffectSettings(),
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
