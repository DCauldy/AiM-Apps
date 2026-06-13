import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  trigger: vi.fn(),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  tasks: {
    trigger: mocks.trigger,
  },
}));

import { POST } from "./route";

describe("POST /api/apps/tours/projects/:projectId/render-proof/noop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers the no-op proof task with an options-shaped Tours render payload", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
    });
    mocks.trigger.mockResolvedValue({ id: "trig-run-1" });

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          renderRunId: "render-run-1",
          options: {
            renderMode: "ken_burns_ffmpeg",
            reuseExistingAssets: true,
          },
        }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    await expect(response.json()).resolves.toEqual({
      taskId: "tours-render-noop-proof",
      triggerRunId: "trig-run-1",
      payload: {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "render-run-1",
        options: {
          proofOnly: true,
          renderMode: "ken_burns_ffmpeg",
          reuseExistingAssets: true,
        },
      },
    });

    expect(mocks.trigger).toHaveBeenCalledWith(
      "tours-render-noop-proof",
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "render-run-1",
        options: {
          proofOnly: true,
          renderMode: "ken_burns_ffmpeg",
          reuseExistingAssets: true,
        },
      },
      {
        tags: ["user:user-1", "tour-project:project-1", "tours-render-noop-proof"],
        metadata: {
          product: "tours",
          proofOnly: true,
          projectId: "project-1",
          renderRunId: "render-run-1",
        },
      }
    );
  });

  it("does not trigger the proof task when Tours access is denied", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Tour project was not found.",
    });

    const response = await POST(
      new Request("http://localhost/api", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ projectId: "missing-project" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tour project was not found." });
    expect(mocks.trigger).not.toHaveBeenCalled();
  });
});
