import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireToursAccess: vi.fn(),
  toursAccessErrorResponse: vi.fn((access: { error: string; status: number }) =>
    Response.json({ error: access.error }, { status: access.status })
  ),
  getSlotState: vi.fn(),
  getProfileApiKey: vi.fn(),
  listHeyGenDigitalTwinAvatarLooks: vi.fn(),
}));

vi.mock("@/lib/tours/access/access.server", () => ({
  requireToursAccess: mocks.requireToursAccess,
  toursAccessErrorResponse: mocks.toursAccessErrorResponse,
}));

vi.mock("@/lib/user-api-keys/service", () => ({
  getProfileApiKey: mocks.getProfileApiKey,
}));

vi.mock("@/lib/profiles/server", () => ({
  getSlotState: mocks.getSlotState,
}));

vi.mock("@/lib/tours/rendering/avatars/heygen-avatars", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tours/rendering/avatars/heygen-avatars")>();
  return {
    ...original,
    listHeyGenDigitalTwinAvatarLooks: mocks.listHeyGenDigitalTwinAvatarLooks,
  };
});

import { HeyGenAvatarsError } from "@/lib/tours/rendering/avatars/heygen-avatars";
import { GET } from "./route";

describe("GET /api/apps/tours/avatars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized avatar looks for the active profile's HeyGen key", async () => {
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
    mocks.getSlotState.mockResolvedValue({ active_profile_id: "profile-1" });
    mocks.getProfileApiKey.mockResolvedValue("heygen-key");
    mocks.listHeyGenDigitalTwinAvatarLooks.mockResolvedValue(avatars);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ avatars });
    expect(mocks.getProfileApiKey).toHaveBeenCalledWith("profile-1", "heygen");
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).toHaveBeenCalledWith({ apiKey: "heygen-key" });
  });

  it("returns 422 when the user has no HeyGen API key", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getSlotState.mockResolvedValue({ active_profile_id: "profile-1" });
    mocks.getProfileApiKey.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Add a HeyGen API key before choosing an avatar.",
    });
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).not.toHaveBeenCalled();
  });

  it("returns 422 when the user has no active profile", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getSlotState.mockResolvedValue({ active_profile_id: null });

    const response = await GET();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Set up a profile before choosing an avatar.",
    });
    expect(mocks.getProfileApiKey).not.toHaveBeenCalled();
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).not.toHaveBeenCalled();
  });

  it("returns a safe 502 for provider errors", async () => {
    mocks.requireToursAccess.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    mocks.getSlotState.mockResolvedValue({ active_profile_id: "profile-1" });
    mocks.getProfileApiKey.mockResolvedValue("heygen-key");
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
    expect(mocks.getSlotState).not.toHaveBeenCalled();
    expect(mocks.getProfileApiKey).not.toHaveBeenCalled();
    expect(mocks.listHeyGenDigitalTwinAvatarLooks).not.toHaveBeenCalled();
  });
});
