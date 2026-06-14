import { describe, expect, test } from "vitest";

import {
  getAvatarSettingsColumnsForSave,
  getAvatarSettingsValidationError,
  HeyGenAvatarProjectPositionSchema,
  type HeyGenAvatarProjectPosition,
} from "./avatar-project-settings";

const validPlacement: HeyGenAvatarProjectPosition = {
  frame: { width: 1080, height: 1920 },
  offsets: { top: 100, left: -40, bottom: 0, right: 120 },
};

describe("HeyGen avatar project settings", () => {
  test("accepts canonical placement offsets with negative crop values", () => {
    expect(HeyGenAvatarProjectPositionSchema.parse(validPlacement)).toEqual(validPlacement);
  });

  test("rejects non-canonical frames and unusable offset rectangles", () => {
    expect(() =>
      HeyGenAvatarProjectPositionSchema.parse({
        ...validPlacement,
        frame: { width: 720, height: 1280 },
      })
    ).toThrow();

    expect(() =>
      HeyGenAvatarProjectPositionSchema.parse({
        frame: { width: 1080, height: 1920 },
        offsets: { top: 0, left: 800, bottom: 0, right: 400 },
      })
    ).toThrow("Avatar placement must leave a positive visible width.");
  });

  test("keeps non-avatar tour projects valid without avatar settings", () => {
    expect(
      getAvatarSettingsValidationError({
        tourType: "tour_video",
        elevenLabsVoiceId: null,
        heyGenAvatarId: null,
        heyGenAvatarPlacement: null,
      })
    ).toBeNull();

    expect(
      getAvatarSettingsColumnsForSave({
        tourType: "tour_video",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: validPlacement,
      })
    ).toEqual({ heygen_avatar_id: null, heygen_avatar_placement: null });
  });

  test("requires voice, avatar look id, and placement for avatar tour projects", () => {
    expect(
      getAvatarSettingsValidationError({
        tourType: "tour_video_avatar",
        elevenLabsVoiceId: null,
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: validPlacement,
      })
    ).toMatch(/ElevenLabs/);

    expect(
      getAvatarSettingsValidationError({
        tourType: "tour_video_avatar",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: null,
        heyGenAvatarPlacement: validPlacement,
      })
    ).toMatch(/HeyGen avatar/);

    expect(
      getAvatarSettingsValidationError({
        tourType: "tour_video_avatar",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: null,
      })
    ).toMatch(/Position/);

    expect(
      getAvatarSettingsValidationError({
        tourType: "tour_video_avatar",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: validPlacement,
      })
    ).toBeNull();
  });

  test("persists avatar columns only for avatar tour projects", () => {
    expect(
      getAvatarSettingsColumnsForSave({
        tourType: "tour_video_avatar",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: validPlacement,
      })
    ).toEqual({
      heygen_avatar_id: "avatar-look-1",
      heygen_avatar_placement: validPlacement,
    });
  });
});
