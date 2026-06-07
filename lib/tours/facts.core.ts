export const TOUR_SCENE_FACT_MAX_LENGTH = 500;

export type TourSceneFactSourceType = "human" | "ai_suggestion";
export type TourSceneFactProofStatus = "proofed" | "suggested" | "rejected";

export type TourSceneFactModel = {
  id: string;
  projectId: string;
  sceneId: string;
  text: string;
  sourceType: TourSceneFactSourceType;
  sourceLabel: string | null;
  sourcePhotoId: string | null;
  provenance: Record<string, unknown>;
  proofStatus: TourSceneFactProofStatus;
  proofedAt: string | null;
  proofedBy: string | null;
  proofMetadata: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TourSceneFactRow = {
  id: string;
  project_id: string;
  scene_id: string;
  fact_text: string;
  source_type: TourSceneFactSourceType;
  source_label: string | null;
  source_photo_id: string | null;
  provenance: Record<string, unknown>;
  proof_status: TourSceneFactProofStatus;
  proofed_at: string | null;
  proofed_by: string | null;
  proof_metadata: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TourSceneFactSceneRow = {
  id: string;
  project_id: string;
};

export type CreateHumanTourSceneFactResult =
  | { ok: true; fact: TourSceneFactModel }
  | { ok: false; error: string };

export type UpdateHumanTourSceneFactResult =
  | { ok: true; fact: TourSceneFactModel }
  | { ok: false; error: string };

export type DeleteTourSceneFactResult =
  | { ok: true; factId: string }
  | { ok: false; error: string };

export type TourSceneScriptContextScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
};

export type ApprovedSceneContextFact = {
  id: string;
  text: string;
  sourceType: TourSceneFactSourceType;
  sourceLabel: string | null;
  sourcePhotoId: string | null;
  sortOrder: number;
};

export type ApprovedSceneScriptContext = {
  sceneId: string;
  sceneTitle: string;
  sceneSortOrder: number;
  included: boolean;
  hasProofedContext: boolean;
  facts: ApprovedSceneContextFact[];
};

export type TourSceneFactsRepository = {
  listFactRowsForProject(projectId: string): Promise<TourSceneFactRow[]>;
  listFactRowsForScene(projectId: string, sceneId: string): Promise<TourSceneFactRow[]>;
  getSceneRow(sceneId: string): Promise<TourSceneFactSceneRow | null>;
  getNextFactSortOrder(projectId: string, sceneId: string): Promise<number>;
  createHumanFact(input: {
    projectId: string;
    sceneId: string;
    text: string;
    sortOrder: number;
    proofedBy: string;
  }): Promise<TourSceneFactRow | null>;
  updateHumanFact(input: {
    projectId: string;
    sceneId: string;
    factId: string;
    text: string;
    proofedBy: string;
  }): Promise<TourSceneFactRow | null>;
  deleteFact(input: {
    projectId: string;
    sceneId: string;
    factId: string;
  }): Promise<boolean>;
};

export function mapTourSceneFact(row: TourSceneFactRow): TourSceneFactModel {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneId: row.scene_id,
    text: row.fact_text,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourcePhotoId: row.source_photo_id,
    provenance: row.provenance,
    proofStatus: row.proof_status,
    proofedAt: row.proofed_at,
    proofedBy: row.proofed_by,
    proofMetadata: row.proof_metadata,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stableFactSort(a: TourSceneFactRow, b: TourSceneFactRow) {
  if (a.scene_id !== b.scene_id) {
    return a.scene_id.localeCompare(b.scene_id);
  }
  if (a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  return a.created_at.localeCompare(b.created_at);
}

export async function listTourSceneFactsForProject(
  projectId: string,
  repository: TourSceneFactsRepository
): Promise<TourSceneFactModel[]> {
  const rows = await repository.listFactRowsForProject(projectId);
  return [...rows].sort(stableFactSort).map(mapTourSceneFact);
}

export async function listTourSceneFactsForScene(
  projectId: string,
  sceneId: string,
  repository: TourSceneFactsRepository
): Promise<TourSceneFactModel[]> {
  const rows = await repository.listFactRowsForScene(projectId, sceneId);
  return [...rows].sort(stableFactSort).map(mapTourSceneFact);
}

export function getApprovedSceneScriptContext(input: {
  scenes: TourSceneScriptContextScene[];
  facts: TourSceneFactModel[];
  includeSkippedScenes?: boolean;
}): ApprovedSceneScriptContext[] {
  const factsBySceneId = new Map<string, ApprovedSceneContextFact[]>();
  for (const fact of input.facts) {
    if (fact.proofStatus !== "proofed") {
      continue;
    }

    const sceneFacts = factsBySceneId.get(fact.sceneId) ?? [];
    sceneFacts.push({
      id: fact.id,
      text: fact.text,
      sourceType: fact.sourceType,
      sourceLabel: fact.sourceLabel,
      sourcePhotoId: fact.sourcePhotoId,
      sortOrder: fact.sortOrder,
    });
    factsBySceneId.set(fact.sceneId, sceneFacts);
  }

  for (const sceneFacts of factsBySceneId.values()) {
    sceneFacts.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }

  return [...input.scenes]
    .filter((scene) => input.includeSkippedScenes || scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((scene) => {
      const facts = factsBySceneId.get(scene.id) ?? [];
      return {
        sceneId: scene.id,
        sceneTitle: scene.title,
        sceneSortOrder: scene.sortOrder,
        included: scene.included,
        hasProofedContext: facts.length > 0,
        facts,
      };
    });
}

export async function createHumanTourSceneFact(
  input: {
    projectId: string;
    sceneId: string;
    text: string;
    proofedBy: string;
  },
  repository: TourSceneFactsRepository
): Promise<CreateHumanTourSceneFactResult> {
  const text = input.text.trim();

  if (!text) {
    return { ok: false, error: "Enter a scene fact." };
  }

  if (text.length > TOUR_SCENE_FACT_MAX_LENGTH) {
    return { ok: false, error: `Scene facts must be ${TOUR_SCENE_FACT_MAX_LENGTH} characters or fewer.` };
  }

  const scene = await repository.getSceneRow(input.sceneId);
  if (!scene) {
    return { ok: false, error: "TourScene was not found." };
  }

  if (scene.project_id !== input.projectId) {
    return { ok: false, error: "Scene facts can only be added within the same Tour Project." };
  }

  const sortOrder = await repository.getNextFactSortOrder(input.projectId, input.sceneId);
  const created = await repository.createHumanFact({
    projectId: input.projectId,
    sceneId: input.sceneId,
    text,
    sortOrder,
    proofedBy: input.proofedBy,
  });

  if (!created) {
    return { ok: false, error: "Could not save the scene fact. Please try again." };
  }

  return { ok: true, fact: mapTourSceneFact(created) };
}

function validateFactText(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return { ok: false as const, error: "Enter a scene fact." };
  }

  if (trimmed.length > TOUR_SCENE_FACT_MAX_LENGTH) {
    return { ok: false as const, error: `Scene facts must be ${TOUR_SCENE_FACT_MAX_LENGTH} characters or fewer.` };
  }

  return { ok: true as const, text: trimmed };
}

export async function updateHumanTourSceneFact(
  input: {
    projectId: string;
    sceneId: string;
    factId: string;
    text: string;
    proofedBy: string;
  },
  repository: TourSceneFactsRepository
): Promise<UpdateHumanTourSceneFactResult> {
  const validatedText = validateFactText(input.text);
  if (!validatedText.ok) {
    return validatedText;
  }

  const updated = await repository.updateHumanFact({
    projectId: input.projectId,
    sceneId: input.sceneId,
    factId: input.factId,
    text: validatedText.text,
    proofedBy: input.proofedBy,
  });

  if (!updated) {
    return { ok: false, error: "Could not update the scene fact. Please try again." };
  }

  return { ok: true, fact: mapTourSceneFact(updated) };
}

export async function deleteTourSceneFact(
  input: {
    projectId: string;
    sceneId: string;
    factId: string;
  },
  repository: TourSceneFactsRepository
): Promise<DeleteTourSceneFactResult> {
  const deleted = await repository.deleteFact(input);

  if (!deleted) {
    return { ok: false, error: "Could not delete the scene fact. Please try again." };
  }

  return { ok: true, factId: input.factId };
}
