import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { getTourRenderProjectSettings } from "./project-settings";

function createProjectSettingsBuilder(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("reads voice and HeyGen avatar settings for render settings", async () => {
  const placement = {
    frame: { width: 1080, height: 1920 },
    offsets: { top: 100, left: 0, bottom: 0, right: 100 },
  };
  const builder = createProjectSettingsBuilder({
    elevenlabs_voice_id: "voice-1",
    heygen_avatar_id: "avatar-look-1",
    heygen_avatar_placement: placement,
  });
  mocks.createClient.mockResolvedValue({ from: vi.fn(() => builder) });

  await expect(
    getTourRenderProjectSettings({ projectId: "project-1", userId: "user-1" })
  ).resolves.toEqual({
    elevenLabsVoiceId: "voice-1",
    heyGenAvatarId: "avatar-look-1",
    heyGenAvatarPlacement: placement,
  });

  expect(builder.select).toHaveBeenCalledWith(
    "elevenlabs_voice_id, heygen_avatar_id, heygen_avatar_placement"
  );
});
