import {
  ASSET_SELECT,
  mapRenderAsset,
} from "./tour-render.repository.mappers";
import type {
  SupabaseClient,
  TourRenderAssetRow,
  TourRenderRepository,
} from "./tour-render.repository.types";

export function createTourRenderAssetsRepository(
  supabase: SupabaseClient
): Pick<
  TourRenderRepository,
  | "getAsset"
  | "createAsset"
  | "recordRunAssetUsage"
  | "findReusableAsset"
  | "markProjectAssetsNonReusable"
> {
  return {
    async getAsset(input) {
      const { data, error } = await supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("id", input.assetId)
        .eq("project_id", input.projectId)
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

    async findReusableAsset(input) {
      let query = supabase
        .from("tour_render_assets")
        .select(ASSET_SELECT)
        .eq("project_id", input.projectId)
        .eq("kind", input.kind)
        .eq("fingerprint_hash", input.fingerprintHash)
        .eq("reusable", true);

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
  };
}
