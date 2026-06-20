import { describe, expect, it, vi } from "vitest";

import {
  planTourScriptStage,
  type TourScriptPlanningProvider,
} from "./tour-script-planning";
import type {
  RenderableTourProject,
  RenderableTourSceneSourcePhoto,
  TourRenderAsset,
  TourRenderRepository,
} from "../repositories/tour-render.repository";

function sourcePhoto(input: {
  id: string;
  storagePath: string;
  fileName: string;
  byteSize: number;
}): RenderableTourSceneSourcePhoto {
  return {
    ...input,
    contentType: "image/jpeg",
    width: input.id === "photo-excluded" ? 100 : 1200,
    height: input.id === "photo-excluded" ? 100 : 800,
    priority: 0,
  };
}

const garagePhoto = sourcePhoto({
  id: "photo-excluded",
  storagePath: "user-1/project-1/garage.jpg",
  fileName: "garage.jpg",
  byteSize: 10,
});
const kitchenPhoto = sourcePhoto({
  id: "photo-1",
  storagePath: "user-1/project-1/kitchen.jpg",
  fileName: "kitchen.jpg",
  byteSize: 123,
});

const project: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Demo Listing",
    propertyAddress: "123 Main St",
    listingUrl: "https://example.com/listing",
    tourType: "tour_video",
  },
  scenes: [
    {
      id: "scene-excluded",
      title: "Garage",
      sortOrder: 0,
      included: false,
      cameraMotion: "static_hold",
      authoritativePhoto: garagePhoto,
      sourcePhotos: [garagePhoto],
      proofedFacts: [{ id: "fact-excluded", text: "Do not send", sortOrder: 1, sourcePhotoId: null }],
    },
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: kitchenPhoto,
      sourcePhotos: [kitchenPhoto],
      proofedFacts: [{ id: "fact-1", text: "Quartz counters", sortOrder: 1, sourcePhotoId: "photo-1" }],
    },
  ],
};

const reusableAsset: TourRenderAsset = {
  id: "asset-reused",
  createdByRunId: "run-old",
  projectId: "project-1",
  sceneId: null,
  kind: "script_plan",
  storageBucket: "tours-generated-media",
  storagePath: "old/script-plan.json",
  contentType: "application/json",
  fingerprintHash: "hash",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

const createdAsset: TourRenderAsset = {
  ...reusableAsset,
  id: "asset-created",
  createdByRunId: "run-1",
  storagePath: "new/script-plan.json",
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
    uploadRenderAssetJson: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "new/script-plan.json",
      contentType: "application/json",
    }),
    uploadRenderAssetBytes: vi.fn(),
    downloadRenderAssetJson: vi.fn().mockResolvedValue({
      fullScript: "Welcome to the kitchen.",
      sceneTimings: [
        {
          sceneId: "scene-1",
          scriptText: "Welcome to the kitchen.",
          durationSeconds: 5,
        },
      ],
      model: "test-model",
    }),
    getRenderRun: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn(),
    createAsset: vi.fn().mockResolvedValue(createdAsset),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

function createProvider(overrides: Partial<TourScriptPlanningProvider> = {}): TourScriptPlanningProvider {
  return {
    planScript: vi.fn().mockResolvedValue({
      fullScript: "Welcome to the kitchen.",
      sceneTimings: [
        {
          sceneId: "scene-1",
          scriptText: "Welcome to the kitchen.",
          durationSeconds: 5,
        },
      ],
      model: "test-model",
      usage: { total_tokens: 100 },
    }),
    ...overrides,
  };
}

describe("planTourScriptStage", () => {
  it("selects a reusable script plan asset when the fingerprint matches", async () => {
    const repository = createRepository({
      findReusableAsset: vi.fn().mockResolvedValue(reusableAsset),
    });
    const provider = createProvider();

    const result = await planTourScriptStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      provider,
    });

    expect(result.reused).toBe(true);
    expect(result.asset.id).toBe("asset-reused");
    expect(provider.planScript).not.toHaveBeenCalled();
    expect(repository.createSignedSourcePhotoUrls).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-reused",
      usage: "reused",
    });
  });

  it("calls the provider with only included scenes, proofed facts, and signed image URLs", async () => {
    const repository = createRepository();
    const provider = createProvider();

    const result = await planTourScriptStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      provider,
      options: { modelId: "openrouter/model", reuseExistingAssets: false },
    });

    expect(result.reused).toBe(false);
    expect(provider.planScript).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "openrouter/model",
        scenes: [
          expect.objectContaining({
            id: "scene-1",
            title: "Kitchen",
            imageUrl: "https://signed.example/kitchen.jpg",
            proofedFacts: [{ id: "fact-1", text: "Quartz counters", sortOrder: 1, sourcePhotoId: "photo-1" }],
          }),
        ],
      })
    );
    expect(JSON.stringify(vi.mocked(provider.planScript).mock.calls[0]?.[0])).not.toContain("Do not send");
  });

  it("throws before persistence when the provider response is invalid", async () => {
    const repository = createRepository();
    const provider = createProvider({
      planScript: vi.fn().mockResolvedValue({
        fullScript: "",
        sceneTimings: [],
        model: "test-model",
      }),
    });

    await expect(
      planTourScriptStage({
        project,
        repository,
        runId: "run-1",
        userId: "user-1",
        provider,
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_INVALID",
    });

    expect(repository.uploadRenderAssetJson).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("uploads the validated plan before creating and attaching a reusable asset", async () => {
    const repository = createRepository();
    const provider = createProvider();

    const result = await planTourScriptStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      provider,
    });

    expect(result.reused).toBe(false);
    expect(repository.uploadRenderAssetJson).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        runId: "run-1",
        kind: "script_plan",
        value: expect.objectContaining({
          fullScript: "Welcome to the kitchen.",
        }),
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "script_plan",
        storageBucket: "tours-generated-media",
        storagePath: "new/script-plan.json",
        reusable: true,
        fingerprint: expect.objectContaining({
          modelId: "google/gemini-2.5-flash",
          scenes: [
            expect.objectContaining({
              id: "scene-1",
              title: "Kitchen",
              cameraMotion: "slow_push",
            }),
          ],
        }),
      })
    );
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-created",
      usage: "created",
    });
  });

  it("normalizes clean spoken text separately from ElevenLabs v3 prompt text", async () => {
    const repository = createRepository();
    const provider = createProvider({
      planScript: vi.fn().mockResolvedValue({
        fullScript: "Clean kitchen narration.",
        voicePromptScript: "[bright, confident real estate host] Clean kitchen narration.",
        sceneTimings: [
          {
            sceneId: "scene-1",
            spokenText: "Clean kitchen narration.",
            voicePromptText: "[bright, confident real estate host] Clean kitchen narration.",
            deliveryTags: ["[bright, confident real estate host]"],
            durationSeconds: 5,
          },
        ],
        model: "test-model",
      }),
    });

    await planTourScriptStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      provider,
      options: { reuseExistingAssets: false },
    });

    expect(repository.uploadRenderAssetJson).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({
          fullScript: "Clean kitchen narration.",
          voicePromptScript: "[bright, confident real estate host] Clean kitchen narration.",
          sceneTimings: [
            expect.objectContaining({
              sceneId: "scene-1",
              spokenText: "Clean kitchen narration.",
              scriptText: "Clean kitchen narration.",
              voicePromptText: "[bright, confident real estate host] Clean kitchen narration.",
              deliveryTags: ["[bright, confident real estate host]"],
            }),
          ],
        }),
      })
    );
  });

  it("preserves planner-selected camera motion for auto scenes", async () => {
    const autoProject: RenderableTourProject = {
      ...project,
      scenes: [
        {
          ...project.scenes[1]!,
          cameraMotion: "auto",
        },
      ],
    };
    const repository = createRepository();
    const provider = createProvider({
      planScript: vi.fn().mockResolvedValue({
        fullScript: "Kitchen narration.",
        sceneTimings: [
          {
            sceneId: "scene-1",
            spokenText: "Kitchen narration.",
            selectedCameraMotion: "detail_glide",
            durationSeconds: 5,
          },
        ],
        model: "test-model",
      }),
    });

    const result = await planTourScriptStage({
      project: autoProject,
      repository,
      runId: "run-1",
      userId: "user-1",
      provider,
      options: { reuseExistingAssets: false },
    });

    expect(result.plan.sceneTimings[0]).toEqual(
      expect.objectContaining({
        sceneId: "scene-1",
        selectedCameraMotion: "detail_glide",
      })
    );
  });

  it("rejects auto scenes when the provider omits selected camera motion", async () => {
    const autoProject: RenderableTourProject = {
      ...project,
      scenes: [
        {
          ...project.scenes[1]!,
          cameraMotion: "auto",
        },
      ],
    };
    const repository = createRepository();
    const provider = createProvider({
      planScript: vi.fn().mockResolvedValue({
        fullScript: "Kitchen narration.",
        sceneTimings: [
          {
            sceneId: "scene-1",
            spokenText: "Kitchen narration.",
            durationSeconds: 5,
          },
        ],
        model: "test-model",
      }),
    });

    await expect(
      planTourScriptStage({
        project: autoProject,
        repository,
        runId: "run-1",
        userId: "user-1",
        provider,
        options: { reuseExistingAssets: false },
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_INVALID",
    });
  });
});
