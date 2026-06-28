import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOpenRouterImageToVideoProvider,
  renderSceneClipsStage,
  type ImageToVideoProvider,
} from "./scene-clips";
import { buildOpenRouterSceneClipPrompt } from "./scene-clip-openrouter";
import type { RenderableTourProject } from "../repositories/tour-render.repository";
import {
  createProviderNormalizer,
  createRepository,
  durations,
  primarySourcePhoto,
  project,
} from "./scene-clips.test-helpers";

describe("scene clip provider rendering", () => {
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
      runId: "scene-clips-run",
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
      runId: "scene-clips-run",
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
      runId: "scene-clips-run",
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
        secondarySourceImageUrls: ["https://signed.example/kitchen-detail.jpg"],
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
});
