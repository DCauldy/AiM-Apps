import {
  createServiceRoleTourRenderRepository,
  type DeleteGeneratedAssetsResult,
  type TourRenderRepository,
} from "./tour-render.repository";

export type CleanupSupersededFreshRenderAssetsInput = {
  projectId: string;
  userId: string;
  runId: string;
};

export type CleanupSupersededFreshRenderAssetsResult = DeleteGeneratedAssetsResult & {
  ok: boolean;
  skippedReason: string | null;
  candidateAssetIds: string[];
  keepAssetIds: string[];
  activeAssetIds: string[];
};

export type EnforceThirtyDayGeneratedAssetRetentionInput = {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
};

export type EnforceThirtyDayGeneratedAssetRetentionResult = DeleteGeneratedAssetsResult & {
  ok: boolean;
  cutoffIso: string;
  eligible: number;
  currentFinalProtected: number;
  activeProtected: number;
  batches: number;
};

type CleanupOptions = {
  repository?: TourRenderRepository;
};

function emptyCleanupResult(skippedReason: string | null): CleanupSupersededFreshRenderAssetsResult {
  return {
    ok: skippedReason === null,
    skippedReason,
    candidateAssetIds: [],
    keepAssetIds: [],
    activeAssetIds: [],
    scanned: 0,
    storageDeleted: 0,
    softDeleted: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };
}

function isFreshRenderOptions(options: Record<string, unknown>): boolean {
  return options.reuseExistingAssets === false;
}

function addDeleteResult(
  target: DeleteGeneratedAssetsResult,
  source: DeleteGeneratedAssetsResult
): DeleteGeneratedAssetsResult {
  target.scanned += source.scanned;
  target.storageDeleted += source.storageDeleted;
  target.softDeleted += source.softDeleted;
  target.skipped += source.skipped;
  target.failed += source.failed;
  target.failures.push(...source.failures);
  return target;
}

function emptyDeleteResult(): DeleteGeneratedAssetsResult {
  return {
    scanned: 0,
    storageDeleted: 0,
    softDeleted: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };
}

export function getRetentionCutoffIso(input: { now: Date; retentionDays: number }): string {
  return new Date(input.now.getTime() - input.retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export function computeSupersededFreshRenderCandidateIds(input: {
  allAssetIds: string[];
  keepAssetIds: string[];
  activeAssetIds: string[];
}): string[] {
  const keep = new Set(input.keepAssetIds);
  const active = new Set(input.activeAssetIds);
  return [...new Set(input.allAssetIds)].filter(
    (assetId) => !keep.has(assetId) && !active.has(assetId)
  );
}

export async function cleanupSupersededFreshRenderAssets(
  input: CleanupSupersededFreshRenderAssetsInput,
  options: CleanupOptions = {}
): Promise<CleanupSupersededFreshRenderAssetsResult> {
  const repository = options.repository ?? createServiceRoleTourRenderRepository();
  const run = await repository.getRenderRun({
    runId: input.runId,
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!run) {
    return emptyCleanupResult("run_not_found");
  }
  if (run.status !== "completed") {
    return emptyCleanupResult("run_not_completed");
  }
  if (!run.resultAssetId) {
    return emptyCleanupResult("result_asset_missing");
  }
  if (!isFreshRenderOptions(run.options)) {
    return emptyCleanupResult("not_fresh_render");
  }

  const candidates = await repository.listSupersededFreshRenderAssetIds({
    projectId: input.projectId,
    completedRunId: input.runId,
    resultAssetId: run.resultAssetId,
  });

  if (candidates.candidateAssetIds.length === 0) {
    return {
      ...emptyCleanupResult(null),
      candidateAssetIds: [],
      keepAssetIds: candidates.keepAssetIds,
      activeAssetIds: candidates.activeAssetIds,
    };
  }

  const deleted = await repository.deleteGeneratedAssets({
    assetIds: candidates.candidateAssetIds,
    reason: "fresh_render_superseded",
  });

  return {
    ok: deleted.failed === 0,
    skippedReason: null,
    candidateAssetIds: candidates.candidateAssetIds,
    keepAssetIds: candidates.keepAssetIds,
    activeAssetIds: candidates.activeAssetIds,
    ...deleted,
  };
}

export async function enforceThirtyDayGeneratedAssetRetention(
  input: EnforceThirtyDayGeneratedAssetRetentionInput = {},
  options: CleanupOptions = {}
): Promise<EnforceThirtyDayGeneratedAssetRetentionResult> {
  const repository = options.repository ?? createServiceRoleTourRenderRepository();
  const retentionDays = input.retentionDays ?? 30;
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 50, 100));
  const maxBatches = Math.max(1, input.maxBatches ?? 10);
  const cutoffIso = getRetentionCutoffIso({
    now: input.now ?? new Date(),
    retentionDays,
  });
  const totals = emptyDeleteResult();
  let eligible = 0;
  let currentFinalProtected = 0;
  let activeProtected = 0;
  let batches = 0;
  let cursor: { createdAt: string; id: string } | null = null;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const candidates = await repository.listRetentionExpiredAssetIds({
      cutoffIso,
      limit: batchSize,
      ...(cursor ? { cursor } : {}),
    });
    batches += 1;
    eligible += candidates.candidateAssetIds.length;
    currentFinalProtected += candidates.currentFinalAssetIds.length;
    activeProtected += candidates.activeAssetIds.length;

    if (candidates.candidateAssetIds.length === 0) {
      totals.scanned += candidates.scanned;
      if (candidates.scanned === batchSize && candidates.nextCursor) {
        cursor = candidates.nextCursor;
        continue;
      }
      break;
    }

    const deleted = await repository.deleteGeneratedAssets({
      assetIds: candidates.candidateAssetIds,
      reason: "retention_expired",
      batchSize,
    });
    addDeleteResult(totals, deleted);

    if (candidates.scanned < batchSize) {
      break;
    }
    cursor = candidates.nextCursor;
    if (!cursor) {
      break;
    }
  }

  return {
    ok: totals.failed === 0,
    cutoffIso,
    eligible,
    currentFinalProtected,
    activeProtected,
    batches,
    ...totals,
  };
}
