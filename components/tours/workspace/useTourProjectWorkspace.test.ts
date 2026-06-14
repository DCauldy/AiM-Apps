import { afterEach, expect, test, vi } from "vitest";

import { updateTourProjectDetails } from "./useTourProjectWorkspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

test("updateTourProjectDetails sends avatar settings so workspace state can round-trip after refetch", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ project: { id: "project-1" } }));
  const placement = {
    frame: { width: 1080 as const, height: 1920 as const },
    offsets: { top: 240, left: 540, bottom: 0, right: 40 },
  };

  await updateTourProjectDetails("project-1", {
    name: "Lake House Tour",
    propertyAddress: "123 Lake Road",
    listingUrl: "",
    elevenLabsVoiceId: "voice-1",
    heyGenAvatarId: "avatar-look-1",
    heyGenAvatarPlacement: placement,
  });

  expect(fetchMock).toHaveBeenCalledWith("/api/apps/tours/projects/project-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Lake House Tour",
      propertyAddress: "123 Lake Road",
      listingUrl: "",
      elevenLabsVoiceId: "voice-1",
      heyGenAvatarId: "avatar-look-1",
      heyGenAvatarPlacement: placement,
    }),
  });
});
