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
  getActiveTourRenderRun: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  getActiveTourRenderRun: mocks.getActiveTourRenderRun,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/projects/:projectId/render-runs/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the active render run without signing completed render URLs", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getActiveTourRenderRun.mockResolvedValue(run);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ activeRun: run });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({
      projectId: "project-1",
      requireOpenProject: true,
    });
    expect(mocks.getActiveTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(mocks.toTourRenderRunStatusResponse).toHaveBeenCalledWith(run);
  });

  it("returns null when no render is active", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getActiveTourRenderRun.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ activeRun: null });
    expect(mocks.toTourRenderRunStatusResponse).not.toHaveBeenCalled();
  });

  it("does not read render status when access is denied or the project is archived", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour project was not found.",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "archived-project" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour project was not found." });
    expect(mocks.getActiveTourRenderRun).not.toHaveBeenCalled();
  });
});
