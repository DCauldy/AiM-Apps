import { beforeEach, describe, expect, it, vi } from "vitest";

const run = {
  id: "run-1",
  status: "running",
  step: "rendering_scene_clips",
  label: "Rendering scene clips",
  progressPercent: 34,
  sceneClipCounts: {
    completed: 0,
    total: 2,
  },
  updatedAt: "2026-06-13T12:00:00.000Z",
  result: null,
  error: null,
  triggerRunId: "trigger-run-1",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  approveAllTourSceneFactsForProject: vi.fn(),
  getTourRenderProjectSettings: vi.fn(),
  createTourRenderRun: vi.fn(),
  getTourRenderRunResultUrl: vi.fn(),
  listRecentTourRenderRuns: vi.fn(),
  preflightTourRenderRun: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
  toTourRenderRunStatusResponseWithResultUrl: vi.fn((value, resultUrl) =>
    resultUrl ? { ...value, result: { assetId: value.resultAssetId, ...resultUrl } } : value
  ),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/facts", () => ({
  approveAllTourSceneFactsForProject: mocks.approveAllTourSceneFactsForProject,
}));

vi.mock("@/lib/tours/rendering/tour-render-project-settings", () => ({
  getTourRenderProjectSettings: mocks.getTourRenderProjectSettings,
}));

vi.mock("@/lib/tours/rendering/tour-render-runs", () => ({
  createTourRenderRun: mocks.createTourRenderRun,
  getTourRenderRunResultUrl: mocks.getTourRenderRunResultUrl,
  listRecentTourRenderRuns: mocks.listRecentTourRenderRuns,
  preflightTourRenderRun: mocks.preflightTourRenderRun,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
  toTourRenderRunStatusResponseWithResultUrl: mocks.toTourRenderRunStatusResponseWithResultUrl,
}));

import { GET, POST } from "./route";

describe("/api/apps/tours/projects/:projectId/render-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTourRenderProjectSettings.mockResolvedValue({ elevenLabsVoiceId: null });
  });

  it("creates a real render task run for an open project", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.preflightTourRenderRun.mockResolvedValue({
      ok: true,
      summary: { projectId: "project-1" },
    });
    mocks.createTourRenderRun.mockResolvedValue(run);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ run });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(mocks.approveAllTourSceneFactsForProject).toHaveBeenCalledWith({
      projectId: "project-1",
      proofedBy: "user-1",
    });
    expect(mocks.getTourRenderProjectSettings).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(mocks.preflightTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(mocks.createTourRenderRun).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        userId: "user-1",
      },
      { skipPreflight: true }
    );
  });

  it("uses the project voice ID when render options do not specify one", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getTourRenderProjectSettings.mockResolvedValue({ elevenLabsVoiceId: "voice-project-1" });
    mocks.preflightTourRenderRun.mockResolvedValue({
      ok: true,
      summary: { projectId: "project-1" },
    });
    mocks.createTourRenderRun.mockResolvedValue(run);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.preflightTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      options: { elevenLabsVoiceId: "voice-project-1" },
    });
    expect(mocks.createTourRenderRun).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        userId: "user-1",
        options: { elevenLabsVoiceId: "voice-project-1" },
      },
      { skipPreflight: true }
    );
  });

  it("returns preflight issues without creating a render run", async () => {
    const preflight = {
      ok: false,
      issues: [
        {
          code: "missing_elevenlabs_key",
          message: "Add an ElevenLabs API key before rendering a voice-over tour.",
          severity: "blocking",
        },
      ],
    };
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.preflightTourRenderRun.mockResolvedValue(preflight);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Tour project is not ready for rendering.",
      preflight,
    });
    expect(mocks.createTourRenderRun).not.toHaveBeenCalled();
    expect(mocks.approveAllTourSceneFactsForProject).toHaveBeenCalledWith({
      projectId: "project-1",
      proofedBy: "user-1",
    });
  });

  it("passes fresh render options through to preflight and run creation", async () => {
    const options = {
      renderMode: "ken_burns_ffmpeg",
      reuseExistingAssets: false,
      reuse: {
        scriptPlan: false,
        voiceover: false,
        avatar: false,
        sceneClips: false,
        finalVideo: false,
      },
    };
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.preflightTourRenderRun.mockResolvedValue({
      ok: true,
      summary: { projectId: "project-1" },
    });
    mocks.createTourRenderRun.mockResolvedValue(run);

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options }),
      }),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.approveAllTourSceneFactsForProject).toHaveBeenCalledWith({
      projectId: "project-1",
      proofedBy: "user-1",
    });
    expect(mocks.preflightTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      options,
    });
    expect(mocks.createTourRenderRun).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        userId: "user-1",
        options,
      },
      { skipPreflight: true }
    );
  });

  it("returns recent render runs for polling from product state", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.listRecentTourRenderRuns.mockResolvedValue([run]);
    mocks.getTourRenderRunResultUrl.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ runs: [run] });
    expect(mocks.listRecentTourRenderRuns).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      limit: 5,
    });
    expect(mocks.getTourRenderRunResultUrl).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
      resultAssetId: undefined,
    });
  });

  it("includes signed download URLs for completed recent render runs", async () => {
    const completedRun = {
      ...run,
      status: "completed",
      progressPercent: 100,
      resultAssetId: "asset-final-video",
    };
    const resultUrl = {
      downloadUrl: "https://storage.example.test/signed-final-video",
      storagePath: "user-1/project-1/run-1/final.mp4",
    };
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.listRecentTourRenderRuns.mockResolvedValue([completedRun]);
    mocks.getTourRenderRunResultUrl.mockResolvedValue(resultUrl);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runs: [
        {
          ...completedRun,
          result: {
            assetId: "asset-final-video",
            ...resultUrl,
          },
        },
      ],
    });
    expect(mocks.getTourRenderRunResultUrl).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
      resultAssetId: "asset-final-video",
    });
  });

  it("does not create a render run when access is denied or the project is archived", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour project was not found.",
    });

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "archived-project" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour project was not found." });
    expect(mocks.approveAllTourSceneFactsForProject).not.toHaveBeenCalled();
    expect(mocks.preflightTourRenderRun).not.toHaveBeenCalled();
    expect(mocks.createTourRenderRun).not.toHaveBeenCalled();
  });
});
