import {
  ASSET_SELECT,
  mapRenderAsset,
} from "./tour-render.repository.mappers";
import type {
  DeleteGeneratedAssetsResult,
  SupabaseClient,
  TourRenderAssetRow,
  TourRenderRepository,
} from "./tour-render.repository.types";

const GENERATED_MEDIA_BUCKET = "tours-generated-media";
const DEFAULT_DELETE_BATCH_SIZE = 25;

function chunkIds(assetIds: string[], batchSize: number): string[][] {
  const normalizedBatchSize = Math.max(1, Math.min(batchSize, 100));
  const chunks: string[][] = [];
  for (let index = 0; index < assetIds.length; index += normalizedBatchSize) {
    chunks.push(assetIds.slice(index, index + normalizedBatchSize));
  }
  return chunks;
}

function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status;
  const message = String(record.message ?? record.error ?? "").toLowerCase();
  return status === 404 || message.includes("not found") || message.includes("not exist");
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

function getSupabaseErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown error";
  const record = error as Record<string, unknown>;
  return String(record.message ?? record.details ?? record.hint ?? "unknown error");
}

function throwSupabaseQueryError(operation: string, error: unknown): never {
  throw new Error(`${operation}: ${getSupabaseErrorMessage(error)}`);
}

export function createTourRenderAssetsRepository(
  supabase: SupabaseClient
): Pick<
  TourRenderRepository,
  | "getAsset"
  | "createAsset"
  | "recordRunAssetUsage"
  | "listRunAssets"
  | "findReusableAsset"
  | "markProjectAssetsNonReusable"
  | "deleteGeneratedAssets"
  | "listSupersededFreshRenderAssetIds"
  | "listRetentionExpiredAssetIds"
> {
  return {
    async getAsset(input) {
      const { data, error } = await supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("id", input.assetId)
        .eq("project_id", input.projectId)
        .is("deleted_at", null)
        .is("storage_deleted_at", null)
        .maybeSingle<TourRenderAssetRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderAsset(data);
    },

    async createAsset(input) {
      const { data, error } = await supabase
        .from("tour_render_assets")
        .insert({
          project_id: input.projectId,
          scene_id: input.sceneId ?? null,
          created_by_run_id: input.createdByRunId ?? null,
          kind: input.kind,
          storage_bucket: input.storageBucket ?? null,
          storage_path: input.storagePath ?? null,
          content_type: input.contentType ?? null,
          fingerprint_hash: input.fingerprintHash,
          fingerprint: input.fingerprint,
          reusable: input.reusable ?? true,
          metadata: input.metadata ?? {},
        })
        .select(ASSET_SELECT)
        .single<TourRenderAssetRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderAsset(data);
    },

    async recordRunAssetUsage(input) {
      const { data, error } = await supabase
        .from("tour_render_run_assets")
        .insert({
          run_id: input.runId,
          asset_id: input.assetId,
          usage: input.usage,
        })
        .select("run_id")
        .single<{ run_id: string }>();

      return !error && Boolean(data);
    },

    async listRunAssets(input) {
      const { data: runAssetRows, error: runAssetsError } = await supabase
        .from("tour_render_run_assets")
        .select("asset_id, created_at")
        .eq("run_id", input.runId)
        .order("created_at", { ascending: true });

      if (runAssetsError || !runAssetRows?.length) {
        return [];
      }

      const assetIds = runAssetRows.map((row) => row.asset_id);
      const { data: assetRows, error: assetsError } = await supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("project_id", input.projectId)
        .in("id", assetIds)
        .is("deleted_at", null)
        .is("storage_deleted_at", null);

      if (assetsError || !assetRows?.length) {
        return [];
      }

      const assetById = new Map(
        (assetRows as TourRenderAssetRow[]).map((row) => [row.id, mapRenderAsset(row)])
      );

      return assetIds.flatMap((assetId) => {
        const asset = assetById.get(assetId);
        return asset ? [asset] : [];
      });
    },

    async findReusableAsset(input) {
      let query = supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("project_id", input.projectId)
        .eq("kind", input.kind)
        .eq("fingerprint_hash", input.fingerprintHash)
        .eq("reusable", true)
        .is("deleted_at", null)
        .is("storage_deleted_at", null);

      query =
        input.sceneId === undefined
          ? query
          : input.sceneId === null
            ? query.is("scene_id", null)
            : query.eq("scene_id", input.sceneId);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<TourRenderAssetRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderAsset(data);
    },

    async markProjectAssetsNonReusable(input) {
      const { error } = await supabase
        .from("tour_render_assets")
        .update({ reusable: false })
        .eq("project_id", input.projectId)
        .eq("reusable", true);

      return !error;
    },

    async deleteGeneratedAssets(input) {
      const uniqueAssetIds = [...new Set(input.assetIds.filter(Boolean))];
      const result = emptyDeleteResult();
      const now = new Date().toISOString();

      for (const batch of chunkIds(uniqueAssetIds, input.batchSize ?? DEFAULT_DELETE_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("tour_render_assets")
          .select(ASSET_SELECT)
          .in("id", batch);

        if (error) {
          result.failed += batch.length;
          result.failures.push(
            ...batch.map((assetId) => ({
              assetId,
              message: "Failed to load asset candidate for deletion.",
            }))
          );
          continue;
        }

        const rows = (data ?? []) as TourRenderAssetRow[];
        result.scanned += rows.length;
        const foundIds = new Set(rows.map((row) => row.id));
        for (const missingId of batch.filter((assetId) => !foundIds.has(assetId))) {
          result.skipped += 1;
          result.failures.push({
            assetId: missingId,
            message: "Asset candidate was not found.",
          });
        }

        for (const row of rows) {
          if (row.deleted_at) {
            result.skipped += 1;
            continue;
          }

          if (row.storage_bucket && row.storage_bucket !== GENERATED_MEDIA_BUCKET) {
            result.skipped += 1;
            continue;
          }

          let storageDeletedAt: string | null = row.storage_deleted_at;
          if (row.storage_bucket === GENERATED_MEDIA_BUCKET && row.storage_path && !row.storage_deleted_at) {
            const { error: removeError } = await supabase.storage
              .from(GENERATED_MEDIA_BUCKET)
              .remove([row.storage_path]);

            if (removeError && !isMissingStorageObjectError(removeError)) {
              result.failed += 1;
              result.failures.push({
                assetId: row.id,
                message: `Failed to delete generated storage object: ${String(
                  (removeError as { message?: unknown }).message ?? "unknown error"
                )}`,
              });
              continue;
            }

            storageDeletedAt = now;
            result.storageDeleted += 1;
          }

          const update: Partial<TourRenderAssetRow> = {
            reusable: false,
            deleted_at: now,
            storage_deleted_at: storageDeletedAt,
            delete_reason: input.reason,
          };

          const { error: updateError } = await supabase
            .from("tour_render_assets")
            .update(update)
            .eq("id", row.id);

          if (updateError) {
            result.failed += 1;
            result.failures.push({
              assetId: row.id,
              message: `Failed to soft-delete asset row: ${String(
                (updateError as { message?: unknown }).message ?? "unknown error"
              )}`,
            });
            continue;
          }

          result.softDeleted += 1;
        }
      }

      return result;
    },

    async listSupersededFreshRenderAssetIds(input) {
      const keepAssetIds = new Set<string>([input.resultAssetId]);

      const { data: runAssets, error: runAssetsError } = await supabase
        .from("tour_render_run_assets")
        .select("asset_id")
        .eq("run_id", input.completedRunId);

      if (runAssetsError) {
        throwSupabaseQueryError("Failed to list completed render run assets", runAssetsError);
      }

      for (const row of (runAssets ?? []) as Array<{ asset_id: string }>) {
        keepAssetIds.add(row.asset_id);
      }

      const { data: activeRuns, error: activeRunsError } = await supabase
        .from("tour_render_runs")
        .select("id")
        .eq("project_id", input.projectId)
        .in("status", ["queued", "running"]);

      if (activeRunsError) {
        throwSupabaseQueryError("Failed to list active render runs", activeRunsError);
      }

      const activeRunIds = ((activeRuns ?? []) as Array<{ id: string }>).map((row) => row.id);
      const activeAssetIds = new Set<string>();
      if (activeRunIds.length > 0) {
        const { data: activeRunAssets, error: activeRunAssetsError } = await supabase
          .from("tour_render_run_assets")
          .select("asset_id")
          .in("run_id", activeRunIds);

        if (activeRunAssetsError) {
          throwSupabaseQueryError("Failed to list active render run assets", activeRunAssetsError);
        }

        for (const row of (activeRunAssets ?? []) as Array<{ asset_id: string }>) {
          activeAssetIds.add(row.asset_id);
        }
      }

      const { data: projectAssets, error: projectAssetsError } = await supabase
        .from("tour_render_assets")
        .select("id")
        .eq("project_id", input.projectId)
        .is("deleted_at", null);

      if (projectAssetsError) {
        throwSupabaseQueryError("Failed to list project render assets", projectAssetsError);
      }

      const candidateAssetIds = ((projectAssets ?? []) as Array<{ id: string }>)
        .map((row) => row.id)
        .filter((assetId) => !keepAssetIds.has(assetId) && !activeAssetIds.has(assetId));

      return {
        candidateAssetIds,
        keepAssetIds: [...keepAssetIds],
        activeAssetIds: [...activeAssetIds],
      };
    },

    async listRetentionExpiredAssetIds(input) {
      let assetQuery = supabase
        .from("tour_render_assets")
        .select("id, project_id, created_at")
        .eq("storage_bucket", GENERATED_MEDIA_BUCKET)
        .is("deleted_at", null)
        .lt("created_at", input.cutoffIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(input.limit);

      if (input.cursor) {
        assetQuery = assetQuery.or(
          `created_at.gt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.gt.${input.cursor.id})`
        );
      }

      const { data: assetRows, error: assetRowsError } = await assetQuery;

      if (assetRowsError) {
        throwSupabaseQueryError("Failed to list retention-expired render assets", assetRowsError);
      }

      const assets = (assetRows ?? []) as Array<{ id: string; project_id: string; created_at: string }>;
      const projectIds = [...new Set(assets.map((asset) => asset.project_id))];
      const assetIds = assets.map((asset) => asset.id);
      const lastScannedAsset = assets.at(-1);
      const nextCursor = lastScannedAsset
        ? { createdAt: lastScannedAsset.created_at, id: lastScannedAsset.id }
        : null;
      if (assets.length === 0 || projectIds.length === 0) {
        return {
          candidateAssetIds: [],
          currentFinalAssetIds: [],
          activeAssetIds: [],
          scanned: 0,
          nextCursor: null,
        };
      }

      const currentFinalAssetIds = new Set<string>();
      const { data: completedRuns, error: completedRunsError } = await supabase
        .from("tour_render_runs")
        .select("project_id, result_asset_id, completed_at")
        .in("project_id", projectIds)
        .eq("status", "completed")
        .not("result_asset_id", "is", null)
        .order("completed_at", { ascending: false });

      if (completedRunsError) {
        throwSupabaseQueryError("Failed to list current final render assets", completedRunsError);
      }

      const seenFinalProjectIds = new Set<string>();
      for (const row of (completedRuns ?? []) as Array<{ project_id: string; result_asset_id: string | null }>) {
        if (!row.result_asset_id || seenFinalProjectIds.has(row.project_id)) continue;
        seenFinalProjectIds.add(row.project_id);
        currentFinalAssetIds.add(row.result_asset_id);
      }

      const activeAssetIds = new Set<string>();
      const { data: activeRuns, error: activeRunsError } = await supabase
        .from("tour_render_runs")
        .select("id")
        .in("project_id", projectIds)
        .in("status", ["queued", "running"]);

      if (activeRunsError) {
        throwSupabaseQueryError("Failed to list active render runs", activeRunsError);
      }

      const activeRunIds = ((activeRuns ?? []) as Array<{ id: string }>).map((row) => row.id);
      if (activeRunIds.length > 0) {
        const { data: activeRunAssets, error: activeRunAssetsError } = await supabase
          .from("tour_render_run_assets")
          .select("asset_id")
          .in("run_id", activeRunIds);

        if (activeRunAssetsError) {
          throwSupabaseQueryError("Failed to list active render run assets", activeRunAssetsError);
        }

        for (const row of (activeRunAssets ?? []) as Array<{ asset_id: string }>) {
          activeAssetIds.add(row.asset_id);
        }
      }

      return {
        candidateAssetIds: assetIds.filter(
          (assetId) => !currentFinalAssetIds.has(assetId) && !activeAssetIds.has(assetId)
        ),
        currentFinalAssetIds: [...currentFinalAssetIds],
        activeAssetIds: [...activeAssetIds],
        scanned: assets.length,
        nextCursor,
      };
    },
  };
}
