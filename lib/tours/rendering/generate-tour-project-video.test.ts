import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateTourProjectVideo } from "./generate-tour-project-video";
import type {
  RenderableTourProject,
  TourRenderAsset,
  TourRenderRepository,
  TourRenderRun,
} from "./tour-render.repository";
import type { TourScriptPlanningProvider } from "./tour-script-planning";

const baseRun: TourRenderRun = {
  id: "run-1",
  projectId: "project-1",
  userId: "user-1",
  triggerRunId: "trigger-run-1",
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

const baseProject: RenderableTourProject = {
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
      proofedFacts: [
        {
          id: "fact-1",
          text: "Quartz counters",
          sortOrder: 1,
          sourcePhotoId: "photo-1",
        },
      ],
    },
  ],
};

const scriptPlanAsset: TourRenderAsset = {
  id: "asset-1",
  createdByRunId: "run-1",
  projectId: "project-1",
  sceneId: null,
  kind: "script_plan",
  storageBucket: "tours-generated-media",
  storagePath: "user-1/project-1/run-1/script-plan.json",
  contentType: "application/json",
  fingerprintHash: "fingerprint-1",
  fingerprint: {},
  reusable: true,
  metadata: {},
  createdAt: "2026-06-13T12:00:00.000Z",
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
    getRenderableTourProject: vi.fn().mockResolvedValue(baseProject),
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
      storagePath: "user-1/project-1/run-1/script-plan.json",
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
    getRenderRun: vi.fn().mockResolvedValue(baseRun),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn((input) =>
      Promise.resolve(
        runWith({
          status: "running",
          currentStep: input.step,
          currentStepLabel: input.label,
          progressPercent: input.progressPercent,
          sceneClipCompletedCount:
            input.sceneClipCompletedCount ?? baseRun.sceneClipCompletedCount,
          sceneClipTotalCount: input.sceneClipTotalCount ?? baseRun.sceneClipTotalCount,
        })
      )
    ),
    markCompleted: vi.fn(() =>
      Promise.resolve(
        runWith({
          status: "completed",
          currentStep: "completed",
          currentStepLabel: "Completed",
          progressPercent: 100,
        })
      )
    ),
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
    createAsset: vi.fn().mockResolvedValue(scriptPlanAsset),
    recordRunAssetUsage: vi.fn(),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

describe("generateTourProjectVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs preflight, records stable shell progress, and fails until final rendering exists", async () => {
    const repository = createRepository();
    const scriptPlanningProvider: TourScriptPlanningProvider = {
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
      }),
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 2,
        sourcePhotoCount: 2,
        proofedFactCount: 1,
        requiredProviderKeys: [],
      },
    });
    const progress = vi.fn();

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: true },
        progress,
      },
      { repository, preflight, scriptPlanningProvider }
    );

    expect(result?.status).toBe("failed");
    expect(preflight).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        userId: "user-1",
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: true },
      },
      { repository }
    );
    expect(repository.updateProgress).toHaveBeenCalledTimes(6);
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: "run-1",
        step: "preparing_assets",
        progressPercent: 10,
      })
    );
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        step: "planning_script",
        progressPercent: 35,
      })
    );
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        step: "uploading_final",
        progressPercent: 90,
      })
    );
    expect(scriptPlanningProvider.planScript).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [
          expect.objectContaining({
            id: "scene-1",
            imageUrl: "https://signed.example/kitchen.jpg",
            proofedFacts: [expect.objectContaining({ text: "Quartz counters" })],
          }),
        ],
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "script_plan",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/script-plan.json",
        reusable: true,
      })
    );
    expect(repository.markCompleted).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "failed",
      label: "Failed",
      safeMessage: "Final video rendering is not implemented yet.",
    });
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        status: "failed",
        safeMessage: "Final video rendering is not implemented yet.",
      })
    );
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        step: "failed",
        message: "Final video rendering is not implemented yet.",
      })
    );
  });

  it("marks the run failed when task preflight finds blocking issues", async () => {
    const repository = createRepository();
    const preflight = vi.fn().mockResolvedValue({
      ok: false,
      issues: [
        {
          code: "generated_media_unwritable",
          message: "Generated media storage is not writable.",
          severity: "blocking",
        },
      ],
    });
    const progress = vi.fn();

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: { renderMode: "ken_burns_ffmpeg" },
        progress,
      },
      { repository, preflight }
    );

    expect(result?.status).toBe("failed");
    expect(repository.updateProgress).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "failed",
      label: "Failed",
      safeMessage: "Generated media storage is not writable.",
    });
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        status: "failed",
        safeMessage: "Generated media storage is not writable.",
      })
    );
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        message: "Generated media storage is not writable.",
      })
    );
  });

  it("marks the run failed with a safe message when orchestration throws", async () => {
    const repository = createRepository({
      updateProgress: vi.fn().mockRejectedValue(new Error("Provider secret should not be exposed")),
    });
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 0,
        requiredProviderKeys: [],
      },
    });

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
      },
      { repository, preflight }
    );

    expect(result?.status).toBe("failed");
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        safeMessage: "Tour render failed before rendering could complete.",
      })
    );
  });
});
