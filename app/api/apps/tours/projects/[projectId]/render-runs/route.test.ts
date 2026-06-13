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
  createFakeTourRenderRun: vi.fn(),
  listRecentTourRenderRuns: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/tour-render-runs", () => ({
  createFakeTourRenderRun: mocks.createFakeTourRenderRun,
  listRecentTourRenderRuns: mocks.listRecentTourRenderRuns,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
}));

import { GET, POST } from "./route";

describe("/api/apps/tours/projects/:projectId/render-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a fake render run for an open project", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.createFakeTourRenderRun.mockResolvedValue(run);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ run });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({
      projectId: "project-1",
      requireOpenProject: true,
    });
    expect(mocks.createFakeTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
  });

  it("returns recent render runs for polling from product state", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.listRecentTourRenderRuns.mockResolvedValue([run]);

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
    expect(mocks.createFakeTourRenderRun).not.toHaveBeenCalled();
  });
});
