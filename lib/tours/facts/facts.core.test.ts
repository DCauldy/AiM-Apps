import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";

import {
  TOUR_SCENE_FACT_MAX_LENGTH,
  createHumanTourSceneFact,
  deleteTourSceneFact,
  getApprovedSceneScriptContext,
  listTourSceneFactsForProject,
  updateHumanTourSceneFact,
  type TourSceneFactRow,
  type TourSceneFactsRepository,
} from "./facts.core";

const baseFactRow: TourSceneFactRow = {
  id: "fact-1",
  project_id: "project-1",
  scene_id: "scene-1",
  fact_text: "Quartz counters",
  source_type: "human",
  source_label: "Agent entry",
  source_photo_id: null,
  provenance: { source: "workspace_sidebar" },
  proof_status: "proofed",
  proofed_at: "2026-06-06T00:00:00.000Z",
  proofed_by: "user-1",
  proof_metadata: { proofedBySource: "human_entry" },
  sort_order: 0,
  created_at: "2026-06-06T00:00:00.000Z",
  updated_at: "2026-06-06T00:00:00.000Z",
};

function createRepository(overrides: Partial<TourSceneFactsRepository> = {}): TourSceneFactsRepository {
  return {
    async listFactRowsForProject() {
      return [];
    },
    async listFactRowsForScene() {
      return [];
    },
    async getSceneRow() {
      return { id: "scene-1", project_id: "project-1" };
    },
    async getNextFactSortOrder() {
      return 0;
    },
    async createHumanFact(input) {
      return {
        ...baseFactRow,
        project_id: input.projectId,
        scene_id: input.sceneId,
        fact_text: input.text,
        sort_order: input.sortOrder,
        proofed_by: input.proofedBy,
      };
    },
    async updateHumanFact(input) {
      return {
        ...baseFactRow,
        project_id: input.projectId,
        scene_id: input.sceneId,
        id: input.factId,
        fact_text: input.text,
        proofed_by: input.proofedBy,
      };
    },
    async deleteFact() {
      return true;
    },
    ...overrides,
  };
}

let createInputs: unknown[];

beforeEach(() => {
  createInputs = [];
});

test("creates a valid human-entered fact as proofed scene context", async () => {
  const repository = createRepository({
    async getNextFactSortOrder() {
      return 3;
    },
    async createHumanFact(input) {
      createInputs.push(input);
      return {
        ...baseFactRow,
        fact_text: input.text,
        sort_order: input.sortOrder,
        proofed_by: input.proofedBy,
      };
    },
  });

  const result = await createHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", text: "  Quartz counters  ", proofedBy: "user-1" },
    repository
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fact.text, "Quartz counters");
    assert.equal(result.fact.sourceType, "human");
    assert.equal(result.fact.proofStatus, "proofed");
    assert.equal(result.fact.sortOrder, 3);
    assert.equal(result.fact.proofedBy, "user-1");
  }
  assert.deepEqual(createInputs, [
    {
      projectId: "project-1",
      sceneId: "scene-1",
      text: "Quartz counters",
      sortOrder: 3,
      proofedBy: "user-1",
    },
  ]);
});

test("rejects empty and oversized human-entered facts before insert", async () => {
  const repository = createRepository({
    async createHumanFact(input) {
      createInputs.push(input);
      return baseFactRow;
    },
  });

  const empty = await createHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", text: "   ", proofedBy: "user-1" },
    repository
  );
  const oversized = await createHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", text: "x".repeat(TOUR_SCENE_FACT_MAX_LENGTH + 1), proofedBy: "user-1" },
    repository
  );

  assert.deepEqual(empty, { ok: false, error: "Enter a scene fact." });
  assert.deepEqual(oversized, {
    ok: false,
    error: `Scene facts must be ${TOUR_SCENE_FACT_MAX_LENGTH} characters or fewer.`,
  });
  assert.deepEqual(createInputs, []);
});

test("rejects missing and cross-project scenes", async () => {
  const missing = await createHumanTourSceneFact(
    { projectId: "project-1", sceneId: "missing-scene", text: "Sunny breakfast nook", proofedBy: "user-1" },
    createRepository({ async getSceneRow() { return null; } })
  );
  const crossProject = await createHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-2", text: "Sunny breakfast nook", proofedBy: "user-1" },
    createRepository({ async getSceneRow() { return { id: "scene-2", project_id: "project-2" }; } })
  );

  assert.deepEqual(missing, { ok: false, error: "TourScene was not found." });
  assert.deepEqual(crossProject, {
    ok: false,
    error: "Scene facts can only be added within the same Tour Project.",
  });
});

test("updates a human-entered fact after text validation", async () => {
  const updateInputs: unknown[] = [];
  const repository = createRepository({
    async updateHumanFact(input) {
      updateInputs.push(input);
      return {
        ...baseFactRow,
        id: input.factId,
        fact_text: input.text,
        proofed_by: input.proofedBy,
      };
    },
  });

  const result = await updateHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", factId: "fact-1", text: "  Quartz island  ", proofedBy: "user-1" },
    repository
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fact.id, "fact-1");
    assert.equal(result.fact.text, "Quartz island");
  }
  assert.deepEqual(updateInputs, [
    {
      projectId: "project-1",
      sceneId: "scene-1",
      factId: "fact-1",
      text: "Quartz island",
      proofedBy: "user-1",
    },
  ]);
});

test("rejects invalid fact edits before persistence", async () => {
  const updateInputs: unknown[] = [];
  const repository = createRepository({
    async updateHumanFact(input) {
      updateInputs.push(input);
      return baseFactRow;
    },
  });

  const result = await updateHumanTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", factId: "fact-1", text: "   ", proofedBy: "user-1" },
    repository
  );

  assert.deepEqual(result, { ok: false, error: "Enter a scene fact." });
  assert.deepEqual(updateInputs, []);
});

test("deletes a scoped scene fact", async () => {
  const deleteInputs: unknown[] = [];
  const repository = createRepository({
    async deleteFact(input) {
      deleteInputs.push(input);
      return true;
    },
  });

  const result = await deleteTourSceneFact(
    { projectId: "project-1", sceneId: "scene-1", factId: "fact-1" },
    repository
  );

  assert.deepEqual(result, { ok: true, factId: "fact-1" });
  assert.deepEqual(deleteInputs, [{ projectId: "project-1", sceneId: "scene-1", factId: "fact-1" }]);
});

test("lists project facts in stable display order", async () => {
  const rows: TourSceneFactRow[] = [
    { ...baseFactRow, id: "fact-3", scene_id: "scene-2", sort_order: 0, created_at: "2026-06-06T00:00:03.000Z" },
    { ...baseFactRow, id: "fact-2", scene_id: "scene-1", sort_order: 1, created_at: "2026-06-06T00:00:02.000Z" },
    { ...baseFactRow, id: "fact-1", scene_id: "scene-1", sort_order: 0, created_at: "2026-06-06T00:00:01.000Z" },
  ];

  const facts = await listTourSceneFactsForProject("project-1", createRepository({
    async listFactRowsForProject() {
      return rows;
    },
  }));

  assert.deepEqual(facts.map((fact) => fact.id), ["fact-1", "fact-2", "fact-3"]);
});

test("builds approved script context from proofed facts for included scenes in scene order", () => {
  const context = getApprovedSceneScriptContext({
    scenes: [
      { id: "scene-2", title: "Bedroom", sortOrder: 1, included: true },
      { id: "scene-1", title: "Kitchen", sortOrder: 0, included: true },
    ],
    facts: [
      { ...baseFactRow, id: "fact-2", scene_id: "scene-1", fact_text: "Large island", sort_order: 1 },
      { ...baseFactRow, id: "fact-1", scene_id: "scene-1", fact_text: "Quartz counters", sort_order: 0 },
      { ...baseFactRow, id: "fact-3", scene_id: "scene-2", fact_text: "Walk-in closet", sort_order: 0 },
    ].map((row) => ({
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
    })),
  });

  assert.deepEqual(context.map((sceneContext) => sceneContext.sceneId), ["scene-1", "scene-2"]);
  assert.deepEqual(context[0].facts.map((fact) => fact.text), ["Quartz counters", "Large island"]);
  assert.equal(context[0].hasProofedContext, true);
});

test("excludes unproofed facts from approved script context", () => {
  const context = getApprovedSceneScriptContext({
    scenes: [{ id: "scene-1", title: "Kitchen", sortOrder: 0, included: true }],
    facts: [
      {
        id: "fact-suggested",
        projectId: "project-1",
        sceneId: "scene-1",
        text: "Suggested claim",
        sourceType: "ai_suggestion",
        sourceLabel: "AI enrichment",
        sourcePhotoId: "photo-1",
        provenance: {},
        proofStatus: "suggested",
        proofedAt: null,
        proofedBy: null,
        proofMetadata: null,
        sortOrder: 0,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
    ],
  });

  assert.equal(context.length, 1);
  assert.equal(context[0].hasProofedContext, false);
  assert.deepEqual(context[0].facts, []);
});

test("excludes skipped scenes from approved script context unless requested", () => {
  const scenes = [
    { id: "scene-1", title: "Kitchen", sortOrder: 0, included: true },
    { id: "scene-2", title: "Bedroom", sortOrder: 1, included: false },
  ];
  const facts = [baseFactRow, { ...baseFactRow, id: "fact-2", scene_id: "scene-2", fact_text: "Skipped scene fact" }].map((row) => ({
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
  }));

  const defaultContext = getApprovedSceneScriptContext({ scenes, facts });
  const withSkippedContext = getApprovedSceneScriptContext({ scenes, facts, includeSkippedScenes: true });

  assert.deepEqual(defaultContext.map((sceneContext) => sceneContext.sceneId), ["scene-1"]);
  assert.deepEqual(withSkippedContext.map((sceneContext) => sceneContext.sceneId), ["scene-1", "scene-2"]);
});
