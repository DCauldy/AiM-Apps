import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  createHumanTourSceneFact as createHumanTourSceneFactWithRepository,
  deleteTourSceneFact as deleteTourSceneFactWithRepository,
  getApprovedSceneScriptContext,
  listTourSceneFactsForProject as listTourSceneFactsForProjectWithRepository,
  listTourSceneFactsForScene as listTourSceneFactsForSceneWithRepository,
  updateHumanTourSceneFact as updateHumanTourSceneFactWithRepository,
  type ApprovedSceneScriptContext,
  type CreateHumanTourSceneFactResult,
  type DeleteTourSceneFactResult,
  type TourSceneFactModel,
  type TourSceneFactRow,
  type TourSceneFactSceneRow,
  type TourSceneFactsRepository,
  type UpdateHumanTourSceneFactResult,
} from "./facts.core";
import { getTourScenesForProject } from "./scenes";

const FACT_SELECT =
  "id, project_id, scene_id, fact_text, source_type, source_label, source_photo_id, provenance, proof_status, proofed_at, proofed_by, proof_metadata, sort_order, created_at, updated_at";

async function createSupabaseTourSceneFactsRepository(): Promise<TourSceneFactsRepository> {
  const supabase = await createClient();

  return {
    async listFactRowsForProject(projectId) {
      const { data, error } = await supabase
        .from("tour_scene_facts")
        .select(FACT_SELECT)
        .eq("project_id", projectId)
        .order("scene_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error || !data) {
        return [];
      }

      return data as TourSceneFactRow[];
    },
    async listFactRowsForScene(projectId, sceneId) {
      const { data, error } = await supabase
        .from("tour_scene_facts")
        .select(FACT_SELECT)
        .eq("project_id", projectId)
        .eq("scene_id", sceneId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error || !data) {
        return [];
      }

      return data as TourSceneFactRow[];
    },
    async getSceneRow(sceneId) {
      const { data, error } = await supabase
        .from("tour_scenes")
        .select("id, project_id")
        .eq("id", sceneId)
        .maybeSingle<TourSceneFactSceneRow>();

      if (error || !data) {
        return null;
      }

      return data;
    },
    async getNextFactSortOrder(projectId, sceneId) {
      const { data } = await supabase
        .from("tour_scene_facts")
        .select("sort_order")
        .eq("project_id", projectId)
        .eq("scene_id", sceneId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle<{ sort_order: number }>();

      return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
    },
    async createHumanFact(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_scene_facts")
        .insert({
          project_id: input.projectId,
          scene_id: input.sceneId,
          fact_text: input.text,
          source_type: "human",
          source_label: "Agent entry",
          provenance: { source: "workspace_sidebar" },
          proof_status: "proofed",
          proofed_at: now,
          proofed_by: input.proofedBy,
          proof_metadata: { proofedBySource: "human_entry" },
          sort_order: input.sortOrder,
          updated_at: now,
        })
        .select(FACT_SELECT)
        .single<TourSceneFactRow>();

      if (error || !data) {
        return null;
      }

      return data;
    },
    async updateHumanFact(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_scene_facts")
        .update({
          fact_text: input.text,
          proof_status: "proofed",
          proofed_at: now,
          proofed_by: input.proofedBy,
          proof_metadata: { proofedBySource: "human_entry_edit" },
          updated_at: now,
        })
        .eq("project_id", input.projectId)
        .eq("scene_id", input.sceneId)
        .eq("id", input.factId)
        .eq("source_type", "human")
        .select(FACT_SELECT)
        .single<TourSceneFactRow>();

      if (error || !data) {
        return null;
      }

      return data;
    },
    async deleteFact(input) {
      const { data, error } = await supabase
        .from("tour_scene_facts")
        .delete()
        .eq("project_id", input.projectId)
        .eq("scene_id", input.sceneId)
        .eq("id", input.factId)
        .select("id")
        .single<{ id: string }>();

      return !error && Boolean(data);
    },
  };
}

export type {
  ApprovedSceneScriptContext,
  CreateHumanTourSceneFactResult,
  DeleteTourSceneFactResult,
  TourSceneFactModel,
  UpdateHumanTourSceneFactResult,
};

export async function listTourSceneFactsForProject(projectId: string): Promise<TourSceneFactModel[]> {
  const repository = await createSupabaseTourSceneFactsRepository();
  return listTourSceneFactsForProjectWithRepository(projectId, repository);
}

export async function listTourSceneFactsForScene(input: {
  projectId: string;
  sceneId: string;
}): Promise<TourSceneFactModel[]> {
  const repository = await createSupabaseTourSceneFactsRepository();
  return listTourSceneFactsForSceneWithRepository(input.projectId, input.sceneId, repository);
}

export async function getApprovedSceneScriptContextForProject(input: {
  projectId: string;
  includeSkippedScenes?: boolean;
}): Promise<ApprovedSceneScriptContext[]> {
  const [scenes, facts] = await Promise.all([
    getTourScenesForProject(input.projectId),
    listTourSceneFactsForProject(input.projectId),
  ]);

  return getApprovedSceneScriptContext({
    scenes,
    facts,
    includeSkippedScenes: input.includeSkippedScenes,
  });
}

export async function createHumanTourSceneFact(input: {
  projectId: string;
  sceneId: string;
  text: string;
  proofedBy: string;
}): Promise<CreateHumanTourSceneFactResult> {
  const repository = await createSupabaseTourSceneFactsRepository();
  return createHumanTourSceneFactWithRepository(input, repository);
}

export async function updateHumanTourSceneFact(input: {
  projectId: string;
  sceneId: string;
  factId: string;
  text: string;
  proofedBy: string;
}): Promise<UpdateHumanTourSceneFactResult> {
  const repository = await createSupabaseTourSceneFactsRepository();
  return updateHumanTourSceneFactWithRepository(input, repository);
}

export async function deleteTourSceneFact(input: {
  projectId: string;
  sceneId: string;
  factId: string;
}): Promise<DeleteTourSceneFactResult> {
  const repository = await createSupabaseTourSceneFactsRepository();
  return deleteTourSceneFactWithRepository(input, repository);
}

export async function approveAllTourSceneFactsForProject(input: {
  projectId: string;
  proofedBy: string;
}): Promise<{ count: number }> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tour_scene_facts")
    .update({
      proof_status: "proofed",
      proofed_at: now,
      proofed_by: input.proofedBy,
      proof_metadata: { proofedBySource: "render_approve_all" },
      updated_at: now,
    })
    .eq("project_id", input.projectId)
    .neq("proof_status", "proofed")
    .select("id");

  if (error || !data) {
    return { count: 0 };
  }

  return { count: data.length };
}
