import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createTourRenderRun,
  getTourRenderRunResultUrl,
  listTourRenderRunAssetsWithUrls,
} from "./tour-render-runs";
import type {
  RenderableTourProject,
  TourRenderRepository,
  TourRenderRun,
} from "./tour-render.repository";

const baseRun: TourRenderRun = {
  id: "run-1",
  projectId: "project-1",
  userId: "user-1",
  triggerRunId: null,
  status: "queued",
  currentStep: "queued",
  currentStepLabel: "Queued",
  progressPercent: 0,
  sceneClipCompletedCount: 0,
  sceneClipTotalCount: 2,
  options: {},
  errorMessage: null,
  resultAssetId: null,
  startedAt: null,
  completedAt: null,
  heartbeatAt: "2026-06-13T12:00:00.000Z",
  createdAt: "2026-06-13T12:00:00.000Z",
  updatedAt: "2026-06-13T12:00:00.000Z",
};

const renderableProject: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Local Seed Tour",
    propertyAddress: "123 Local Seed Lane",
    listingUrl: null,
    tourType: "tour_video",
  },
  scenes: [
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 0,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: {
        id: "photo-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        width: 1600,
        height: 900,
      },
      proofedFacts: [],
    },
  ],
};

function runWith(overrides: Partial<TourRenderRun>): TourRenderRun {
  return {
    ...baseRun,
    ...overrides,
  };
}

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn().mockResolvedValue(renderableProject),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn(),
    uploadRenderAssetJson: vi.fn(),
    uploadRenderAssetBytes: vi.fn(),
    downloadRenderAssetJson: vi.fn(),
    downloadRenderAssetBytes: vi.fn(),
    createSignedGeneratedMediaUrl: vi.fn(),
    getAsset: vi.fn(),
    getRenderRun: vi.fn(),
    getRenderRunByIdForUser: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn().mockResolvedValue(baseRun),
    attachTriggerRunId: vi.fn((input) =>
      Promise.resolve(
        runWith({
          triggerRunId: input.triggerRunId,
        })
      )
    ),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn((input) =>
      Promise.resolve(
        runWith({
          status: "failed",
          currentStep: input.step,
          currentStepLabel: input.label,
          errorMessage: input.safeMessage,
        })
      )
    ),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn().mockResolvedValue(true),
    createAsset: vi.fn(),
    recordRunAssetUsage: vi.fn(),
    listRunAssets: vi.fn(),
    findReusableAsset: vi.fn(),
    markProjectAssetsNonReusable: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as TourRenderRepository;
}

describe("createTourRenderRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a queued product run, triggers the real render task, and attaches the Trigger run id", async () => {
    const repository = createRepository();
    const triggerTask = vi.fn().mockResolvedValue({ id: "trigger-run-1" });

    const run = await createTourRenderRun(
      {
        projectId: "project-1",
        userId: "user-1",
      },
      {
        repository,
        triggerTask,
        skipPreflight: true,
      }
    );

    expect(run?.triggerRunId).toBe("trigger-run-1");
    expect(repository.createRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      sceneClipTotalCount: 1,
      options: {
        renderMode: "ken_burns_ffmpeg",
        reuseExistingAssets: true,
        tourType: "tour_video",
      },
    });
    expect(triggerTask).toHaveBeenCalledWith(
      "render-tour-project",
      expect.objectContaining({
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
      }),
      expect.objectContaining({
        idempotencyKey: "tour-render:run-1",
        concurrencyKey: "tour-project:project-1",
        tags: ["user:user-1", "tour-project:project-1", "render-tour-project"],
      })
    );
    expect(repository.attachTriggerRunId).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      triggerRunId: "trigger-run-1",
    });
  });

  it("marks existing project assets non-reusable before creating a fresh run", async () => {
    const repository = createRepository();
    const triggerTask = vi.fn().mockResolvedValue({ id: "trigger-run-1" });

    await createTourRenderRun(
      {
        projectId: "project-1",
        userId: "user-1",
        options: {
          reuseExistingAssets: false,
          reuse: {
            scriptPlan: false,
            voiceover: false,
            avatar: false,
            sceneClips: false,
            finalVideo: false,
          },
        },
      },
      {
        repository,
        triggerTask,
        skipPreflight: true,
      }
    );

    expect(repository.markProjectAssetsNonReusable).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(repository.getRenderableTourProject).toHaveBeenCalled();
    expect(repository.createRenderRun).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          reuseExistingAssets: false,
          reuse: {
            scriptPlan: false,
            voiceover: false,
            avatar: false,
            sceneClips: false,
            finalVideo: false,
          },
          tourType: "tour_video",
        }),
      })
    );
  });

  it("does not enqueue a fresh run when existing assets cannot be invalidated", async () => {
    const repository = createRepository({
      markProjectAssetsNonReusable: vi.fn().mockResolvedValue(false),
    });
    const triggerTask = vi.fn().mockResolvedValue({ id: "trigger-run-1" });

    const run = await createTourRenderRun(
      {
        projectId: "project-1",
        userId: "user-1",
        options: { reuseExistingAssets: false },
      },
      {
        repository,
        triggerTask,
        skipPreflight: true,
      }
    );

    expect(run).toBeNull();
    expect(repository.createRenderRun).not.toHaveBeenCalled();
    expect(triggerTask).not.toHaveBeenCalled();
  });

  it("marks the product run failed when Trigger cannot enqueue the real render task", async () => {
    const repository = createRepository();
    const triggerTask = vi.fn().mockRejectedValue(new Error("Trigger unavailable"));

    const run = await createTourRenderRun(
      {
        projectId: "project-1",
        userId: "user-1",
      },
      {
        repository,
        triggerTask,
        skipPreflight: true,
      }
    );

    expect(run?.status).toBe("failed");
    expect(repository.attachTriggerRunId).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "failed",
      label: "Failed",
      safeMessage: "Could not start the render task. Try again.",
    });
    expect(repository.appendEvent).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      step: "failed",
      status: "failed",
      safeMessage: "Could not start the render task. Try again.",
      metadata: {
        reason: "trigger_enqueue_failed",
      },
    });
  });
});

describe("getTourRenderRunResultUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the download title into the generated media signed URL", async () => {
    const repository = createRepository({
      getAsset: vi.fn().mockResolvedValue({
        id: "asset-final",
        kind: "final_video",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/final.mp4",
      }),
      createSignedGeneratedMediaUrl: vi.fn().mockResolvedValue({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/final.mp4",
        signedUrl: "https://storage.example.test/final.mp4?token=abc&download=Lake+House+Tour.mp4",
      }),
    });

    const result = await getTourRenderRunResultUrl(
      {
        projectId: "project-1",
        userId: "user-1",
        runId: "run-1",
        resultAssetId: "asset-final",
        downloadTitle: "Lake House Tour.mp4",
      },
      { repository }
    );

    expect(result?.downloadUrl).toBe(
      "https://storage.example.test/final.mp4?token=abc&download=Lake+House+Tour.mp4"
    );
    expect(repository.createSignedGeneratedMediaUrl).toHaveBeenCalledWith({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/final.mp4",
      downloadTitle: "Lake House Tour.mp4",
    });
  });
});

describe("listTourRenderRunAssetsWithUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns run assets with signed URLs for generated media assets", async () => {
    const repository = createRepository({
      getRenderRunByIdForUser: vi.fn().mockResolvedValue(baseRun),
      listRunAssets: vi.fn().mockResolvedValue([
        {
          id: "asset-json",
          createdByRunId: "run-1",
          projectId: "project-1",
          sceneId: null,
          kind: "script_plan",
          storageBucket: "tours-generated-media",
          storagePath: "user-1/project-1/run-1/script-plan.json",
          contentType: "application/json",
          fingerprintHash: "fingerprint-json",
          fingerprint: {},
          reusable: true,
          metadata: {},
          createdAt: "2026-06-13T12:00:00.000Z",
        },
        {
          id: "asset-memory",
          createdByRunId: "run-1",
          projectId: "project-1",
          sceneId: null,
          kind: "narration_text",
          storageBucket: null,
          storagePath: null,
          contentType: "text/plain",
          fingerprintHash: "fingerprint-memory",
          fingerprint: {},
          reusable: true,
          metadata: {},
          createdAt: "2026-06-13T12:00:00.000Z",
        },
      ]),
      createSignedGeneratedMediaUrl: vi.fn().mockResolvedValue({
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/script-plan.json",
        signedUrl: "https://storage.example.test/script-plan.json?token=abc",
      }),
    });

    const assets = await listTourRenderRunAssetsWithUrls(
      {
        runId: "run-1",
        userId: "user-1",
      },
      { repository }
    );

    expect(assets).toEqual([
      expect.objectContaining({
        id: "asset-json",
        name: "script-plan.json",
        url: "https://storage.example.test/script-plan.json?token=abc",
      }),
    ]);
    expect(repository.getRenderRunByIdForUser).toHaveBeenCalledWith({
      runId: "run-1",
      userId: "user-1",
    });
    expect(repository.listRunAssets).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
    });
    expect(repository.createSignedGeneratedMediaUrl).toHaveBeenCalledWith({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/script-plan.json",
      downloadTitle: "script-plan.json",
    });
  });

  it("returns null when the render run is not owned by the user", async () => {
    const repository = createRepository({
      getRenderRunByIdForUser: vi.fn().mockResolvedValue(null),
    });

    const assets = await listTourRenderRunAssetsWithUrls(
      {
        runId: "run-1",
        userId: "user-1",
      },
      { repository }
    );

    expect(assets).toBeNull();
    expect(repository.listRunAssets).not.toHaveBeenCalled();
  });
});
