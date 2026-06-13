import { beforeEach, describe, expect, it, vi } from "vitest";

const run = {
  id: "run-1",
  status: "running",
  step: "joining_video",
  label: "Joining scene clips",
  progressPercent: 67,
  sceneClipCounts: {
    completed: 1,
    total: 2,
  },
  updatedAt: "2026-06-13T12:00:02.000Z",
  result: null,
  error: null,
  triggerRunId: "trigger-run-1",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getTourRenderRunStatus: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/tour-render-runs", () => ({
  getTourRenderRunStatus: mocks.getTourRenderRunStatus,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/projects/:projectId/render-runs/:runId/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the project-scoped render run status", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getTourRenderRunStatus.mockResolvedValue(run);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1", runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run });
    expect(mocks.getTourRenderRunStatus).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
    });
  });

  it("does not read render status when access is denied or the project is archived", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour project was not found.",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "archived-project", runId: "run-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour project was not found." });
    expect(mocks.getTourRenderRunStatus).not.toHaveBeenCalled();
  });
});
