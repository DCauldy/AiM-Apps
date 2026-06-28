import { beforeEach, describe, expect, it, vi } from "vitest";

const activeRun = {
  id: "run-active",
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

const completedRun = {
  ...activeRun,
  id: "run-completed",
  status: "completed",
  progressPercent: 100,
  resultAssetId: "asset-final-video",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getTourRenderRunsSummary: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  getTourRenderRunsSummary: mocks.getTourRenderRunsSummary,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/projects/:projectId/render-runs/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active and downloadable render summary without signing URLs", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getTourRenderRunsSummary.mockResolvedValue({
      activeRun,
      latestDownloadableRun: completedRun,
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeRun,
      latestDownloadableRun: completedRun,
    });
    expect(mocks.getTourRenderRunsSummary).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(mocks.toTourRenderRunStatusResponse).toHaveBeenCalledTimes(2);
  });

  it("does not read render status when access is denied", async () => {
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
    expect(mocks.getTourRenderRunsSummary).not.toHaveBeenCalled();
  });
});
