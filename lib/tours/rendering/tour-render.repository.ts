import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createTourRenderAssetsRepository } from "./tour-render-assets.repository";
import { createTourRenderProjectRepository } from "./tour-render-project.repository";
import { createTourRenderRunsRepository } from "./tour-render-runs.repository";
import { createTourRenderStorageRepository } from "./tour-render-storage.repository";
import type {
  SupabaseClient,
  TourRenderRepository,
} from "./tour-render.repository.types";

export type {
  CreateTourRenderAssetInput,
  CreateTourRenderRunInput,
  DeleteGeneratedAssetsResult,
  DeleteTourRenderAssetReason,
  RenderableTourProject,
  RenderableTourScene,
  SignedGeneratedMediaUrl,
  SignedSourcePhotoUrl,
  TourRenderAsset,
  TourRenderAssetKind,
  TourRenderEventStatus,
  TourRenderPreflightProject,
  TourRenderPreflightScene,
  TourRenderRepository,
  TourRenderRun,
  TourRenderRunAssetUsage,
  TourRenderRunStatus,
  TourRenderStep,
  UpdateTourRenderProgressInput,
  UploadedRenderAsset,
} from "./tour-render.repository.types";
export { TOUR_RENDER_STEPS } from "./tour-render.repository.types";

export async function createTourRenderRepository(): Promise<TourRenderRepository> {
  const supabase = await createClient();
  return createTourRenderRepositoryFromSupabase(supabase);
}

export function createServiceRoleTourRenderRepository(): TourRenderRepository {
  return createTourRenderRepositoryFromSupabase(createServiceRoleClient());
}

export function createTourRenderRepositoryFromSupabase(
  supabase: SupabaseClient
): TourRenderRepository {
  return {
    ...createTourRenderProjectRepository(supabase),
    ...createTourRenderStorageRepository(supabase),
    ...createTourRenderRunsRepository(supabase),
    ...createTourRenderAssetsRepository(supabase),
  };
}
