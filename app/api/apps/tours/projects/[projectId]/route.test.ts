import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getTourProjectWorkspaceViewModel: vi.fn(),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/tours/workspace", () => ({
  getTourProjectWorkspaceViewModel: mocks.getTourProjectWorkspaceViewModel,
}));

import { GET } from "./route";

describe("GET /api/apps/tours/projects/:projectId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires access to an open Tour Project before loading the workspace", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour Project was not found.",
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour Project was not found." });
    expect(mocks.requireToursAccess).toHaveBeenCalledWith({
      projectId: "project-1",
      requireOpenProject: true,
    });
    expect(mocks.getTourProjectWorkspaceViewModel).not.toHaveBeenCalled();
  });

  it("preserves the workspace response shape for accessible projects", async () => {
    const workspace = { project: { id: "project-1" }, scenes: [] };
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getTourProjectWorkspaceViewModel.mockResolvedValue(workspace);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workspace });
  });
});
