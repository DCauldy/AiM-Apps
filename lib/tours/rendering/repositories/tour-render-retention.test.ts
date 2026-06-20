import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  cleanupSupersededFreshRenderAssets,
  computeSupersededFreshRenderCandidateIds,
  enforceThirtyDayGeneratedAssetRetention,
  getRetentionCutoffIso,
} from "./tour-render-retention";
import type { TourRenderRepository, TourRenderRun } from "./tour-render.repository";

const completedFreshRun: TourRenderRun = {
  id: "run-fresh",
  projectId: "project-1",
  userId: "user-1",
  triggerRunId: "trigger-1",
  status: "completed",
  currentStep: "completed",
  currentStepLabel: "Completed",
  progressPercent: 100,
  sceneClipCompletedCount: 2,
  sceneClipTotalCount: 2,
  options: { reuseExistingAssets: false, renderMode: "ken_burns_ffmpeg" },
  errorMessage: null,
  resultAssetId: "asset-current-final",
  startedAt: "2026-06-14T12:00:00.000Z",
  completedAt: "2026-06-14T12:30:00.000Z",
  heartbeatAt: "2026-06-14T12:30:00.000Z",
  createdAt: "2026-06-14T12:00:00.000Z",
  updatedAt: "2026-06-14T12:30:00.000Z",
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
    uploadRenderAssetBytes: vi.fn(),
    downloadRenderAssetJson: vi.fn(),
    downloadRenderAssetBytes: vi.fn(),
    createSignedGeneratedMediaUrl: vi.fn(),
    getAsset: vi.fn(),
    getRenderRun: vi.fn().mockResolvedValue(completedFreshRun),
    getRenderRunByIdForUser: vi.fn(),
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
    createAsset: vi.fn(),
    recordRunAssetUsage: vi.fn(),
    listRunAssets: vi.fn(),
    findReusableAsset: vi.fn(),
    markProjectAssetsNonReusable: vi.fn(),
    deleteGeneratedAssets: vi.fn().mockResolvedValue({
      scanned: 2,
      storageDeleted: 2,
      softDeleted: 2,
      skipped: 0,
      failed: 0,
      failures: [],
    }),
    listSupersededFreshRenderAssetIds: vi.fn().mockResolvedValue({
      candidateAssetIds: ["asset-old-script", "asset-old-final"],
      keepAssetIds: ["asset-current-final", "asset-reused-scene"],
      activeAssetIds: [],
    }),
    listRetentionExpiredAssetIds: vi.fn().mockResolvedValue({
      candidateAssetIds: [],
      currentFinalAssetIds: [],
      activeAssetIds: [],
      scanned: 0,
      nextCursor: null,
    }),
    ...overrides,
  } as TourRenderRepository;
}

describe("cleanupSupersededFreshRenderAssets", () => {
  it("deletes superseded assets after a completed fresh render", async () => {
    const repository = createRepository();

    const result = await cleanupSupersededFreshRenderAssets(
      { projectId: "project-1", userId: "user-1", runId: "run-fresh" },
      { repository }
    );

    expect(result.ok).toBe(true);
    expect(repository.listSupersededFreshRenderAssetIds).toHaveBeenCalledWith({
      projectId: "project-1",
      completedRunId: "run-fresh",
      resultAssetId: "asset-current-final",
    });
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledWith({
      assetIds: ["asset-old-script", "asset-old-final"],
      reason: "fresh_render_superseded",
    });
  });

  it("keeps reused assets and active-run dependencies out of candidate sets", () => {
    expect(
      computeSupersededFreshRenderCandidateIds({
        allAssetIds: ["asset-current-final", "asset-reused-scene", "asset-old-final", "asset-active"],
        keepAssetIds: ["asset-current-final", "asset-reused-scene"],
        activeAssetIds: ["asset-active"],
      })
    ).toEqual(["asset-old-final"]);
  });

  it("does not clean up failed, queued, running, or cancelled fresh renders", async () => {
    for (const status of ["failed", "queued", "running", "cancelled"] as const) {
      const repository = createRepository({
        getRenderRun: vi.fn().mockResolvedValue({ ...completedFreshRun, status }),
      });

      const result = await cleanupSupersededFreshRenderAssets(
        { projectId: "project-1", userId: "user-1", runId: "run-fresh" },
        { repository }
      );

      expect(result.skippedReason).toBe("run_not_completed");
      expect(repository.deleteGeneratedAssets).not.toHaveBeenCalled();
    }
  });

  it("does not clean up completed runs without a recorded result asset", async () => {
    const repository = createRepository({
      getRenderRun: vi.fn().mockResolvedValue({ ...completedFreshRun, resultAssetId: null }),
    });

    const result = await cleanupSupersededFreshRenderAssets(
      { projectId: "project-1", userId: "user-1", runId: "run-fresh" },
      { repository }
    );

    expect(result.skippedReason).toBe("result_asset_missing");
    expect(repository.deleteGeneratedAssets).not.toHaveBeenCalled();
  });

  it("does not clean up non-fresh completed renders", async () => {
    const repository = createRepository({
      getRenderRun: vi.fn().mockResolvedValue({
        ...completedFreshRun,
        options: { reuseExistingAssets: true },
      }),
    });

    const result = await cleanupSupersededFreshRenderAssets(
      { projectId: "project-1", userId: "user-1", runId: "run-fresh" },
      { repository }
    );

    expect(result.skippedReason).toBe("not_fresh_render");
    expect(repository.deleteGeneratedAssets).not.toHaveBeenCalled();
  });

  it("does not delete anything when superseded candidate discovery fails", async () => {
    const repository = createRepository({
      listSupersededFreshRenderAssetIds: vi.fn().mockRejectedValue(new Error("query failed")),
    });

    await expect(
      cleanupSupersededFreshRenderAssets(
        { projectId: "project-1", userId: "user-1", runId: "run-fresh" },
        { repository }
      )
    ).rejects.toThrow("query failed");
    expect(repository.deleteGeneratedAssets).not.toHaveBeenCalled();
  });
});

describe("retention cutoff", () => {
  it("uses a strict 30-day cutoff timestamp", () => {
    expect(
      getRetentionCutoffIso({
        now: new Date("2026-06-14T12:00:00.000Z"),
        retentionDays: 30,
      })
    ).toBe("2026-05-15T12:00:00.000Z");
  });
});

describe("enforceThirtyDayGeneratedAssetRetention", () => {
  it("deletes retention-expired intermediate assets using the shared deletion path", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi.fn().mockResolvedValueOnce({
        candidateAssetIds: ["asset-old-json", "asset-old-audio", "asset-old-scene-clip"],
        currentFinalAssetIds: [],
        activeAssetIds: [],
        scanned: 3,
        nextCursor: { createdAt: "2026-05-01T00:00:03.000Z", id: "asset-old-scene-clip" },
      }),
      deleteGeneratedAssets: vi.fn().mockResolvedValue({
        scanned: 3,
        storageDeleted: 3,
        softDeleted: 3,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    });

    const result = await enforceThirtyDayGeneratedAssetRetention(
      {
        now: new Date("2026-06-14T12:00:00.000Z"),
        batchSize: 3,
        maxBatches: 1,
      },
      { repository }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        cutoffIso: "2026-05-15T12:00:00.000Z",
        eligible: 3,
        storageDeleted: 3,
        softDeleted: 3,
        failed: 0,
      })
    );
    expect(repository.listRetentionExpiredAssetIds).toHaveBeenCalledWith({
      cutoffIso: "2026-05-15T12:00:00.000Z",
      limit: 3,
    });
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledWith({
      assetIds: ["asset-old-json", "asset-old-audio", "asset-old-scene-clip"],
      reason: "retention_expired",
      batchSize: 3,
    });
  });

  it("reports current-final and active-run protections without deleting protected rows", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi.fn().mockResolvedValueOnce({
        candidateAssetIds: ["asset-old-final"],
        currentFinalAssetIds: ["asset-current-final"],
        activeAssetIds: ["asset-active-scene-clip"],
        scanned: 3,
        nextCursor: { createdAt: "2026-05-01T00:00:03.000Z", id: "asset-active-scene-clip" },
      }),
      deleteGeneratedAssets: vi.fn().mockResolvedValue({
        scanned: 1,
        storageDeleted: 1,
        softDeleted: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    });

    const result = await enforceThirtyDayGeneratedAssetRetention(
      { now: new Date("2026-06-14T12:00:00.000Z"), batchSize: 10, maxBatches: 1 },
      { repository }
    );

    expect(result.currentFinalProtected).toBe(1);
    expect(result.activeProtected).toBe(1);
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledWith({
      assetIds: ["asset-old-final"],
      reason: "retention_expired",
      batchSize: 10,
    });
  });

  it("does not keep every old generated asset when a project has no completed final video", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi.fn().mockResolvedValueOnce({
        candidateAssetIds: ["asset-orphan-json"],
        currentFinalAssetIds: [],
        activeAssetIds: [],
        scanned: 1,
        nextCursor: { createdAt: "2026-05-01T00:00:01.000Z", id: "asset-orphan-json" },
      }),
      deleteGeneratedAssets: vi.fn().mockResolvedValue({
        scanned: 1,
        storageDeleted: 1,
        softDeleted: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    });

    const result = await enforceThirtyDayGeneratedAssetRetention(
      { now: new Date("2026-06-14T12:00:00.000Z"), batchSize: 10, maxBatches: 1 },
      { repository }
    );

    expect(result.eligible).toBe(1);
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ["asset-orphan-json"] })
    );
  });

  it("continues scanning bounded batches while full batches are returned", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi
        .fn()
        .mockResolvedValueOnce({
          candidateAssetIds: ["asset-old-1", "asset-old-2"],
          currentFinalAssetIds: [],
          activeAssetIds: [],
          scanned: 2,
          nextCursor: { createdAt: "2026-05-01T00:00:02.000Z", id: "asset-old-2" },
        })
        .mockResolvedValueOnce({
          candidateAssetIds: ["asset-old-3"],
          currentFinalAssetIds: [],
          activeAssetIds: [],
          scanned: 1,
          nextCursor: { createdAt: "2026-05-01T00:00:03.000Z", id: "asset-old-3" },
        }),
      deleteGeneratedAssets: vi.fn().mockResolvedValue({
        scanned: 1,
        storageDeleted: 1,
        softDeleted: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    });

    const result = await enforceThirtyDayGeneratedAssetRetention(
      { now: new Date("2026-06-14T12:00:00.000Z"), batchSize: 2, maxBatches: 3 },
      { repository }
    );

    expect(result.batches).toBe(2);
    expect(result.eligible).toBe(3);
    expect(repository.listRetentionExpiredAssetIds).toHaveBeenCalledTimes(2);
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledTimes(2);
  });

  it("keeps scanning after a full batch contains only protected old assets", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi
        .fn()
        .mockResolvedValueOnce({
          candidateAssetIds: [],
          currentFinalAssetIds: ["asset-current-final"],
          activeAssetIds: ["asset-active"],
          scanned: 2,
          nextCursor: { createdAt: "2026-05-01T00:00:02.000Z", id: "asset-active" },
        })
        .mockResolvedValueOnce({
          candidateAssetIds: ["asset-old-eligible"],
          currentFinalAssetIds: [],
          activeAssetIds: [],
          scanned: 1,
          nextCursor: { createdAt: "2026-05-01T00:00:03.000Z", id: "asset-old-eligible" },
        }),
      deleteGeneratedAssets: vi.fn().mockResolvedValue({
        scanned: 1,
        storageDeleted: 1,
        softDeleted: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    });

    const result = await enforceThirtyDayGeneratedAssetRetention(
      { now: new Date("2026-06-14T12:00:00.000Z"), batchSize: 2, maxBatches: 3 },
      { repository }
    );

    expect(result.batches).toBe(2);
    expect(result.eligible).toBe(1);
    expect(repository.listRetentionExpiredAssetIds).toHaveBeenNthCalledWith(2, {
      cutoffIso: "2026-05-15T12:00:00.000Z",
      limit: 2,
      cursor: { createdAt: "2026-05-01T00:00:02.000Z", id: "asset-active" },
    });
    expect(repository.deleteGeneratedAssets).toHaveBeenCalledWith({
      assetIds: ["asset-old-eligible"],
      reason: "retention_expired",
      batchSize: 2,
    });
  });

  it("does not delete anything when retention candidate discovery fails", async () => {
    const repository = createRepository({
      listRetentionExpiredAssetIds: vi.fn().mockRejectedValue(new Error("query failed")),
    });

    await expect(
      enforceThirtyDayGeneratedAssetRetention(
        { now: new Date("2026-06-14T12:00:00.000Z"), batchSize: 2, maxBatches: 1 },
        { repository }
      )
    ).rejects.toThrow("query failed");
    expect(repository.deleteGeneratedAssets).not.toHaveBeenCalled();
  });
});
