import {
  FACT_SELECT,
  PROJECT_SELECT,
  SCENE_SELECT,
  SOURCE_PHOTO_SELECT,
  mapTourRenderPreflightProject,
} from "./tour-render.repository.mappers";
import type {
  RenderableTourScene,
  SupabaseClient,
  TourProjectRow,
  TourRenderPreflightProject,
  TourRenderRepository,
  TourSceneFactRow,
  TourSceneRow,
  TourSceneSourcePhotoRow,
} from "./tour-render.repository.types";

export async function loadTourRenderPreflightProject(
  supabase: SupabaseClient,
  input: { projectId: string; userId: string }
): Promise<TourRenderPreflightProject | null> {
  const { data: project, error: projectError } = await supabase
    .from("tours_projects")
    .select(PROJECT_SELECT)
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle<TourProjectRow>();

  if (projectError || !project) {
    return null;
  }

  const { data: scenes, error: scenesError } = await supabase
    .from("tour_scenes")
    .select(SCENE_SELECT)
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: true });

  if (scenesError || !scenes) {
    return null;
  }

  const { data: sourcePhotos, error: sourcePhotosError } = await supabase
    .from("tour_scene_source_photos")
    .select(SOURCE_PHOTO_SELECT)
    .eq("project_id", input.projectId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (sourcePhotosError || !sourcePhotos) {
    return null;
  }

  const { data: facts, error: factsError } = await supabase
    .from("tour_scene_facts")
    .select(FACT_SELECT)
    .eq("project_id", input.projectId)
    .eq("proof_status", "proofed")
    .order("scene_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (factsError || !facts) {
    return null;
  }

  return mapTourRenderPreflightProject({
    project,
    scenes: scenes as TourSceneRow[],
    sourcePhotos: sourcePhotos as TourSceneSourcePhotoRow[],
    facts: facts as TourSceneFactRow[],
  });
}

export function createTourRenderProjectRepository(
  supabase: SupabaseClient
): Pick<TourRenderRepository, "getTourRenderPreflightProject" | "getRenderableTourProject"> {
  return {
    async getTourRenderPreflightProject(input) {
      return loadTourRenderPreflightProject(supabase, input);
    },

    async getRenderableTourProject(input) {
      const preflightProject = await loadTourRenderPreflightProject(supabase, input);
      if (!preflightProject) {
        return null;
      }

      return {
        project: {
          id: preflightProject.project.id,
          userId: preflightProject.project.userId,
          name: preflightProject.project.name,
          propertyAddress: preflightProject.project.propertyAddress,
          listingUrl: preflightProject.project.listingUrl,
          tourType: preflightProject.project.tourType,
        },
        scenes: preflightProject.scenes.filter(
          (scene): scene is RenderableTourScene => scene.authoritativePhoto !== null
        ),
      };
    },
  };
}
