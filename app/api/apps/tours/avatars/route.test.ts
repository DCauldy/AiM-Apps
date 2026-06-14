import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getUserApiKey: vi.fn(),
  listHeyGenDigitalTwinAvatarLooks: vi.fn(),
}));

vi.mock("@/lib/tours/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/user-api-keys/service", () => ({
  getUserApiKey: mocks.getUserApiKey,
}));

vi.mock("@/lib/tours/rendering/heygen-avatars", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tours/rendering/heygen-avatars")>();
  return {
    ...original,
    listHeyGenDigitalTwinAvatarLooks: mocks.listHeyGenDigitalTwinAvatarLooks,
  };
});

import { HeyGenAvatarsError } from "@/lib/tours/rendering/heygen-avatars";
import { GET } from "./route";

describe("GET /api/apps/tours/avatars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized avatar looks for the authenticated user's HeyGen key", async () => {
    const avatars = [
      {
        id: "look-1",
        name: "Main Look",
        avatarType: "digital_twin",
        groupId: "group-1",
        gender: null,
        previewImageUrl: null,
        previewVideoUrl: null,
        tags: [],
        supportedApiEngines: [],
        status: "completed",
      },
    ];
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getUserApiKey.mockResolvedValue("heygen-key");
    mocks.listHeyGenDigitalTwinAvatarLooks.mockResolvedValue(avatars);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ avatars });
    expect(mocks.getUserApiKey).toHaveBeenCalledWith("user-1", "heygen");
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).toHaveBeenCalledWith({ apiKey: "heygen-key" });
  });

  it("returns 422 when the user has no HeyGen API key", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getUserApiKey.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Add a HeyGen API key before choosing an avatar.",
    });
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).not.toHaveBeenCalled();
  });

  it("returns a safe 502 for provider errors", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getUserApiKey.mockResolvedValue("heygen-key");
    mocks.listHeyGenDigitalTwinAvatarLooks.mockRejectedValue(
      new HeyGenAvatarsError("Could not load HeyGen avatars.", "HEYGEN_AVATARS_FAILED")
    );

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not load HeyGen avatars." });
  });

  it("does not load avatars when access is denied", async () => {
    mocks.requireToursAccess.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Sign in to continue.",
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getUserApiKey).not.toHaveBeenCalled();
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).not.toHaveBeenCalled();
  });
});
