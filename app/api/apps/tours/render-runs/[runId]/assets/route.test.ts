import { beforeEach, describe, expect, it, vi } from "vitest";

const asset = {
  id: "asset-1",
  name: "final-video.mp4",
  url: "https://storage.example.test/final-video.mp4?token=abc",
};

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  listTourRenderRunAssetsWithUrls: vi.fn(),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/rendering/runs/render-runs", () => ({
  listTourRenderRunAssetsWithUrls: mocks.listTourRenderRunAssetsWithUrls,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/render-runs/:runId/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns signed assets for a render run owned by the current user", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.listTourRenderRunAssetsWithUrls.mockResolvedValue([asset]);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assets: [asset] });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith();
    expect(mocks.listTourRenderRunAssetsWithUrls).toHaveBeenCalledWith({
      runId: "run-1",
      userId: "user-1",
    });
  });

  it("does not load assets when tours access is denied", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.listTourRenderRunAssetsWithUrls).not.toHaveBeenCalled();
  });

  it("returns 404 when the render run is not owned by the current user", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.listTourRenderRunAssetsWithUrls.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ runId: "missing-run" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Render run was not found." });
  });
});
