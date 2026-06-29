import { describe, expect, test } from "vitest";
import {
  getChangedTourProjectSettingsForUpdate,
  getRequiredSettingsState,
  getRequiredSettingsValidationError,
  getTourProjectConfiguration,
  getTourProjectSettingsColumnsForSave,
  getTourProjectSettingsPayloadForCreate,
  type TourProjectSettings,
} from "./project-configuration";
import type { HeyGenAvatarProjectPosition } from "../avatar-settings/avatar-project-settings";

const placement: HeyGenAvatarProjectPosition = {
  frame: { width: 1080, height: 1920 },
  offsets: { top: 100, left: 120, bottom: 0, right: 80 },
};

const existingAvatarSettings: TourProjectSettings = {
  elevenLabsVoiceId: "voice-1",
  heyGenAvatarId: "avatar-look-1",
  heyGenAvatarPlacement: placement,
};

describe("tour project configuration policy", () => {
  test("plain video requires neither voice nor avatar and clears settings on save", () => {
    expect(getTourProjectConfiguration("tour_video")).toEqual({
      supportsVoiceSelection: false,
      supportsAvatarSettings: false,
      requiresVoiceSelection: false,
      requiresAvatarSettings: false,
    });
    expect(
      getRequiredSettingsValidationError({
        tourType: "tour_video",
        ...existingAvatarSettings,
      })
    ).toBeNull();
    expect(
      getTourProjectSettingsColumnsForSave({
        tourType: "tour_video",
        ...existingAvatarSettings,
      })
    ).toEqual({
      elevenlabs_voice_id: null,
      heygen_avatar_id: null,
      heygen_avatar_placement: null,
    });
  });

  test("voice-over tours require voice but not avatar", () => {
    expect(getTourProjectConfiguration("tour_video_voice_over")).toEqual({
      supportsVoiceSelection: true,
      supportsAvatarSettings: false,
      requiresVoiceSelection: true,
      requiresAvatarSettings: false,
    });
    expect(
      getRequiredSettingsValidationError({
        tourType: "tour_video_voice_over",
        elevenLabsVoiceId: null,
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: placement,
      })
    ).toMatch(/ElevenLabs/);
    expect(
      getTourProjectSettingsColumnsForSave({
        tourType: "tour_video_voice_over",
        ...existingAvatarSettings,
      })
    ).toEqual({
      elevenlabs_voice_id: "voice-1",
      heygen_avatar_id: null,
      heygen_avatar_placement: null,
    });
  });

  test("avatar tours require voice, avatar id, and placement", () => {
    expect(getTourProjectConfiguration("tour_video_avatar")).toEqual({
      supportsVoiceSelection: true,
      supportsAvatarSettings: true,
      requiresVoiceSelection: true,
      requiresAvatarSettings: true,
    });
    expect(
      getRequiredSettingsState({
        tourType: "tour_video_avatar",
        elevenLabsVoiceId: "",
        heyGenAvatarId: "",
        heyGenAvatarPlacement: null,
      })
    ).toEqual({ isVoiceSelectionMissing: true, isAvatarSelectionMissing: true });
    expect(
      getRequiredSettingsValidationError({
        tourType: "tour_video_avatar",
        ...existingAvatarSettings,
      })
    ).toBeNull();
  });

  test("create payload omits unsupported settings when switching away from avatar", () => {
    expect(
      getTourProjectSettingsPayloadForCreate({
        tourType: "tour_video_voice_over",
        ...existingAvatarSettings,
      })
    ).toEqual({ elevenLabsVoiceId: "voice-1" });

    expect(
      getTourProjectSettingsPayloadForCreate({
        tourType: "tour_video",
        ...existingAvatarSettings,
      })
    ).toEqual({});
  });

  test("updates preserve omitted supported settings", () => {
    expect(
      getChangedTourProjectSettingsForUpdate({
        tourType: "tour_video_avatar",
        currentSettings: existingAvatarSettings,
        updates: {},
      })
    ).toEqual({});
  });

  test("updates clear settings when the effective tour type no longer supports them", () => {
    expect(
      getChangedTourProjectSettingsForUpdate({
        tourType: "tour_video_voice_over",
        currentSettings: existingAvatarSettings,
        updates: {},
      })
    ).toEqual({
      heygen_avatar_id: null,
      heygen_avatar_placement: null,
    });

    expect(
      getChangedTourProjectSettingsForUpdate({
        tourType: "tour_video",
        currentSettings: existingAvatarSettings,
        updates: {},
      })
    ).toEqual({
      elevenlabs_voice_id: null,
      heygen_avatar_id: null,
      heygen_avatar_placement: null,
    });
  });
});
