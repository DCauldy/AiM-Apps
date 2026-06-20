import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  preflightTourRenderRun: vi.fn(),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  preflightTourRenderRun: mocks.preflightTourRenderRun,
}));

import { POST } from "./route";

describe("POST /api/apps/tours/projects/:projectId/render-preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a passing preflight result for an accessible project", async () => {
    const preflight = {
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 0,
        requiredProviderKeys: [],
      },
    };
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.preflightTourRenderRun.mockResolvedValue(preflight);

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ preflight });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(mocks.preflightTourRenderRun).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
  });

  it("returns blocking preflight issues as unprocessable", async () => {
    const preflight = {
      ok: false,
      issues: [
        {
          code: "no_included_scenes",
          message: "Include at least one scene before rendering.",
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
    await expect(response.json()).resolves.toEqual({ preflight });
  });

  it("does not preflight when access is denied", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour Project was not found.",
    });

    const response = await POST(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.preflightTourRenderRun).not.toHaveBeenCalled();
  });
});
