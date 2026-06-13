import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTourRenderRepositoryFromSupabase } from "./tour-render.repository";

const now = "2026-06-13T12:00:00.000Z";

function projectRow(overrides = {}) {
  return {
    id: "project-1",
    user_id: "user-1",
    name: "Local Seed Tour",
    property_address: "123 Local Seed Lane",
    listing_url: "https://example.com/listing",
    tour_type: "tour_video",
    ...overrides,
  };
}

function sceneRow(overrides = {}) {
  return {
    id: "scene-1",
    project_id: "project-1",
    title: "Kitchen",
    sort_order: 0,
    included: true,
    camera_motion: "slow_push",
    ...overrides,
  };
}

function sourcePhotoRow(overrides = {}) {
  return {
    id: "photo-1",
    project_id: "project-1",
    scene_id: "scene-1",
    storage_path: "user-1/project-1/photo.jpg",
    file_name: "photo.jpg",
    content_type: "image/jpeg",
    byte_size: 123,
    width: 1600,
    height: 900,
    priority: 0,
    created_at: now,
    ...overrides,
  };
}

function factRow(overrides = {}) {
  return {
    id: "fact-1",
    scene_id: "scene-1",
    fact_text: "Bright kitchen with updated finishes.",
    source_photo_id: "photo-1",
    sort_order: 0,
    created_at: now,
    ...overrides,
  };
}

function runRow(overrides = {}) {
  return {
    id: "run-1",
    project_id: "project-1",
    user_id: "user-1",
    trigger_run_id: null,
    status: "queued",
    current_step: "queued",
    current_step_label: "Queued",
    progress_percent: 0,
    scene_clip_completed_count: 0,
    scene_clip_total_count: 0,
    options: {},
    error_message: null,
    result_asset_id: null,
    started_at: null,
    completed_at: null,
    heartbeat_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function assetRow(overrides = {}) {
  return {
    id: "asset-1",
    created_by_run_id: "run-1",
    project_id: "project-1",
    scene_id: null,
    kind: "script_plan",
    storage_bucket: "tours-generated-media",
    storage_path: "user-1/project-1/run-1/script-plan.json",
    content_type: "application/json",
    fingerprint_hash: "fingerprint-1",
    fingerprint: { projectVersion: 1 },
    reusable: true,
    metadata: { provider: "test" },
    created_at: now,
    ...overrides,
  };
}

function createQueryBuilder(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function createListBuilder(result: { data: unknown[] | null; error: unknown } = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  return {
    chain,
    resolveOrder: () => {
      chain.order = vi.fn(() => chain);
      (chain.order as ReturnType<typeof vi.fn>).mockImplementationOnce(() => chain);
      (chain.order as ReturnType<typeof vi.fn>).mockImplementationOnce(() => chain);
      (chain.order as ReturnType<typeof vi.fn>).mockImplementationOnce(() => Promise.resolve(result));
    },
  };
}

function createInsertBuilder(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("tour render repository", () => {
  test("loads a renderable project view scoped by project id and user id", async () => {
    const projectQuery = createQueryBuilder({ data: projectRow(), error: null });

    const scenesQuery = createListBuilder({
      data: [
        sceneRow({ id: "scene-2", title: "Bedroom", sort_order: 1, camera_motion: "static_hold" }),
        sceneRow({ id: "scene-1", title: "Kitchen", sort_order: 0, camera_motion: "slow_push" }),
      ],
      error: null,
    }).chain;
    (scenesQuery.order as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        sceneRow({ id: "scene-2", title: "Bedroom", sort_order: 1, camera_motion: "static_hold" }),
        sceneRow({ id: "scene-1", title: "Kitchen", sort_order: 0, camera_motion: "slow_push" }),
      ],
      error: null,
    });

    const sourcePhotosQuery = createListBuilder({
      data: [
        sourcePhotoRow({ id: "photo-2", scene_id: "scene-2", storage_path: "user-1/project-1/bedroom.jpg" }),
        sourcePhotoRow({ id: "photo-1", scene_id: "scene-1", storage_path: "user-1/project-1/kitchen.jpg" }),
      ],
      error: null,
    }).chain;
    (sourcePhotosQuery.order as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(sourcePhotosQuery)
      .mockResolvedValueOnce({
        data: [
          sourcePhotoRow({ id: "photo-2", scene_id: "scene-2", storage_path: "user-1/project-1/bedroom.jpg" }),
          sourcePhotoRow({ id: "photo-1", scene_id: "scene-1", storage_path: "user-1/project-1/kitchen.jpg" }),
        ],
        error: null,
      });

    const factsQuery = createListBuilder({
      data: [
        factRow({ id: "fact-2", scene_id: "scene-1", fact_text: "Updated appliances.", sort_order: 1 }),
        factRow({ id: "fact-1", scene_id: "scene-1", fact_text: "Bright kitchen.", sort_order: 0 }),
      ],
      error: null,
    }).chain;
    (factsQuery.order as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(factsQuery)
      .mockReturnValueOnce(factsQuery)
      .mockResolvedValueOnce({
        data: [
          factRow({ id: "fact-2", scene_id: "scene-1", fact_text: "Updated appliances.", sort_order: 1 }),
          factRow({ id: "fact-1", scene_id: "scene-1", fact_text: "Bright kitchen.", sort_order: 0 }),
        ],
        error: null,
      });

    const from = vi
      .fn()
      .mockReturnValueOnce(projectQuery)
      .mockReturnValueOnce(scenesQuery)
      .mockReturnValueOnce(sourcePhotosQuery)
      .mockReturnValueOnce(factsQuery);
    const repository = createTourRenderRepositoryFromSupabase({ from } as never);

    const project = await repository.getRenderableTourProject({
      projectId: "project-1",
      userId: "user-1",
    });

    expect(project?.project).toMatchObject({
      id: "project-1",
      userId: "user-1",
      propertyAddress: "123 Local Seed Lane",
      tourType: "tour_video",
    });
    expect(project?.scenes.map((scene) => scene.id)).toEqual(["scene-1", "scene-2"]);
    expect(project?.scenes[0]?.authoritativePhoto.storagePath).toBe("user-1/project-1/kitchen.jpg");
    expect(project?.scenes[0]?.proofedFacts.map((fact) => fact.text)).toEqual([
      "Bright kitchen.",
      "Updated appliances.",
    ]);
    expect(projectQuery.eq).toHaveBeenCalledWith("id", "project-1");
    expect(projectQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(scenesQuery.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(sourcePhotosQuery.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(factsQuery.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(factsQuery.eq).toHaveBeenCalledWith("proof_status", "proofed");
  });

  test("returns null for missing or denied project access without loading child rows", async () => {
    const projectQuery = createQueryBuilder({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(projectQuery);
    const repository = createTourRenderRepositoryFromSupabase({ from } as never);

    const project = await repository.getRenderableTourProject({
      projectId: "project-1",
      userId: "other-user",
    });

    expect(project).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
    expect(projectQuery.eq).toHaveBeenCalledWith("id", "project-1");
    expect(projectQuery.eq).toHaveBeenCalledWith("user_id", "other-user");
  });

  test("persists render run lifecycle changes with project and user scoping", async () => {
    const createRunQuery = createInsertBuilder({
      data: runRow({ scene_clip_total_count: 2, options: { renderMode: "ken_burns_ffmpeg" } }),
      error: null,
    });
    const attachTriggerQuery = createInsertBuilder({
      data: runRow({ trigger_run_id: "trigger-run-1" }),
      error: null,
    });
    const updateProgressQuery = createInsertBuilder({
      data: runRow({
        status: "running",
        current_step: "rendering_scene_clips",
        current_step_label: "Rendering scene clips",
        progress_percent: 50,
      }),
      error: null,
    });
    const markFailedQuery = createInsertBuilder({
      data: runRow({
        status: "failed",
        current_step: "failed",
        current_step_label: "Failed",
        error_message: "Provider timed out",
      }),
      error: null,
    });
    const markCompletedQuery = createInsertBuilder({
      data: runRow({
        status: "completed",
        current_step: "completed",
        current_step_label: "Completed",
        progress_percent: 100,
        result_asset_id: "asset-final",
      }),
      error: null,
    });
    const heartbeatQuery = createInsertBuilder({ data: runRow({ heartbeat_at: now }), error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(createRunQuery)
      .mockReturnValueOnce(attachTriggerQuery)
      .mockReturnValueOnce(updateProgressQuery)
      .mockReturnValueOnce(markFailedQuery)
      .mockReturnValueOnce(markCompletedQuery)
      .mockReturnValueOnce(heartbeatQuery);
    const repository = createTourRenderRepositoryFromSupabase({ from } as never);

    const created = await repository.createRenderRun({
      projectId: "project-1",
      userId: "user-1",
      sceneClipTotalCount: 2,
      options: { renderMode: "ken_burns_ffmpeg" },
    });
    await repository.attachTriggerRunId({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      triggerRunId: "trigger-run-1",
    });
    const progress = await repository.updateProgress({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "rendering_scene_clips",
      label: "Rendering scene clips",
      progressPercent: 50,
      sceneClipCompletedCount: 1,
      sceneClipTotalCount: 2,
    });
    const failed = await repository.markFailed({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "failed",
      label: "Failed",
      safeMessage: "Provider timed out",
    });
    const completed = await repository.markCompleted({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      resultAssetId: "asset-final",
    });
    await repository.recordHeartbeat({ runId: "run-1", projectId: "project-1", userId: "user-1" });

    expect(created?.sceneClipTotalCount).toBe(2);
    expect(progress?.status).toBe("running");
    expect(failed?.errorMessage).toBe("Provider timed out");
    expect(completed?.resultAssetId).toBe("asset-final");
    expect(createRunQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        user_id: "user-1",
        options: { renderMode: "ken_burns_ffmpeg" },
      })
    );
    for (const query of [attachTriggerQuery, updateProgressQuery, markFailedQuery, markCompletedQuery, heartbeatQuery]) {
      expect(query.eq).toHaveBeenCalledWith("id", "run-1");
      expect(query.eq).toHaveBeenCalledWith("project_id", "project-1");
      expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    }
  });

  test("persists events and assets, records run usage, and queries reusable assets", async () => {
    const eventQuery = createInsertBuilder({ data: { id: "event-1" }, error: null });
    const createAssetQuery = createInsertBuilder({ data: assetRow(), error: null });
    const usageQuery = createInsertBuilder({ data: { run_id: "run-1" }, error: null });
    const reusableQuery = createQueryBuilder({ data: assetRow({ id: "asset-reused" }), error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(eventQuery)
      .mockReturnValueOnce(createAssetQuery)
      .mockReturnValueOnce(usageQuery)
      .mockReturnValueOnce(reusableQuery);
    const repository = createTourRenderRepositoryFromSupabase({ from } as never);

    const eventCreated = await repository.appendEvent({
      runId: "run-1",
      projectId: "project-1",
      step: "planning_script",
      status: "running",
      safeMessage: "Planning script",
      metadata: { provider: "openrouter" },
    });
    const asset = await repository.createAsset({
      projectId: "project-1",
      createdByRunId: "run-1",
      kind: "script_plan",
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/script-plan.json",
      contentType: "application/json",
      fingerprintHash: "fingerprint-1",
      fingerprint: { projectVersion: 1 },
      metadata: { provider: "test" },
    });
    const usageCreated = await repository.recordRunAssetUsage({
      runId: "run-1",
      assetId: "asset-1",
      usage: "created",
    });
    const reusable = await repository.findReusableAsset({
      projectId: "project-1",
      kind: "script_plan",
      fingerprintHash: "fingerprint-1",
      sceneId: null,
    });

    expect(eventCreated).toBe(true);
    expect(asset?.id).toBe("asset-1");
    expect(usageCreated).toBe(true);
    expect(reusable?.id).toBe("asset-reused");
    expect(eventQuery.insert).toHaveBeenCalledWith({
      run_id: "run-1",
      project_id: "project-1",
      step: "planning_script",
      status: "running",
      message: "Planning script",
      metadata: { provider: "openrouter" },
    });
    expect(createAssetQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        kind: "script_plan",
        fingerprint_hash: "fingerprint-1",
      })
    );
    expect(usageQuery.insert).toHaveBeenCalledWith({
      run_id: "run-1",
      asset_id: "asset-1",
      usage: "created",
    });
    expect(reusableQuery.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(reusableQuery.eq).toHaveBeenCalledWith("kind", "script_plan");
    expect(reusableQuery.eq).toHaveBeenCalledWith("fingerprint_hash", "fingerprint-1");
    expect(reusableQuery.eq).toHaveBeenCalledWith("reusable", true);
    expect(reusableQuery.is).toHaveBeenCalledWith("scene_id", null);
  });
});
