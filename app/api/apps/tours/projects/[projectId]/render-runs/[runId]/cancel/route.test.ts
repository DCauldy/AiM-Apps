import { beforeEach, describe, expect, it, vi } from "vitest";

const run = {
  id: "run-1",
  status: "cancelled",
  step: "cancelled",
  label: "Cancelled",
  progressPercent: 67,
  sceneClipCounts: {
    completed: 1,
    total: 2,
  },
  updatedAt: "2026-06-13T12:00:02.000Z",
  result: null,
  error: {
    message: "Render cancelled by user request.",
  },
  triggerRunId: "trigger-run-1",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  cancelTourRenderRun: vi.fn(),
  toTourRenderRunStatusResponse: vi.fn((value) => value),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  cancelTourRenderRun: mocks.cancelTourRenderRun,
  toTourRenderRunStatusResponse: mocks.toTourRenderRunStatusResponse,
}));

import { POST } from "./route";

describe("POST /api/apps/tours/projects/:projectId/render-runs/:runId/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels an active project-scoped render run", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
      project: { id: "project-1", name: "Lake House Tour", status: "open" },
    });
    mocks.cancelTourRenderRun.mockResolvedValue(run);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1", runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({
      projectId: "project-1",
      requireOpenProject: true,
    });
    expect(mocks.cancelTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
    });
  });

  it("returns a conflict when the render run is already inactive", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
      project: { id: "project-1", name: "Lake House Tour", status: "open" },
    });
    mocks.cancelTourRenderRun.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1", runId: "run-completed" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Render run is no longer active or was not found.",
    });
  });

  it("does not cancel when access is denied or the project is archived", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour project was not found.",
    });

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "archived-project", runId: "run-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour project was not found." });
    expect(mocks.cancelTourRenderRun).not.toHaveBeenCalled();
  });
});
