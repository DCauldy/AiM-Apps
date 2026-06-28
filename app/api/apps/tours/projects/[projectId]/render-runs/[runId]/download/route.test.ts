import { beforeEach, describe, expect, it, vi } from "vitest";

const completedRun = {
  id: "run-1",
  status: "completed",
  resultAssetId: "asset-final-video",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getTourRenderRunResultUrl: vi.fn(),
  getTourRenderRunStatus: vi.fn(),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  getTourRenderRunResultUrl: mocks.getTourRenderRunResultUrl,
  getTourRenderRunStatus: mocks.getTourRenderRunStatus,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/projects/:projectId/render-runs/:runId/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs the completed render result on demand and redirects to it", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
      project: { id: "project-1", name: "Lake House Tour", status: "open" },
    });
    mocks.getTourRenderRunStatus.mockResolvedValue(completedRun);
    mocks.getTourRenderRunResultUrl.mockResolvedValue({
      downloadUrl: "https://storage.example.test/final.mp4?token=abc",
      storagePath: "user-1/project-1/run-1/final.mp4",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1", runId: "run-1" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://storage.example.test/final.mp4?token=abc",
    );
    expect(mocks.getTourRenderRunStatus).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
    });
    expect(mocks.getTourRenderRunResultUrl).toHaveBeenCalledWith({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
      resultAssetId: "asset-final-video",
      downloadTitle: "Lake House Tour.mp4",
    });
  });

  it("does not sign missing or incomplete render runs", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getTourRenderRunStatus.mockResolvedValue({
      ...completedRun,
      status: "running",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1", runId: "run-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Completed render was not found.",
    });
    expect(mocks.getTourRenderRunResultUrl).not.toHaveBeenCalled();
  });

  it("does not read render status when access is denied", async () => {
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
