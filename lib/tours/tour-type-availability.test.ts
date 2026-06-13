import { describe, expect, it } from "vitest";

import {
  getMissingProviderKeysForTourType,
  getRequiredProviderKeysForTourType,
  isTourTypeAvailable,
} from "./tour-type-availability";

describe("tour type provider-key availability", () => {
  it("does not require provider keys for plain tour videos", () => {
    expect(getRequiredProviderKeysForTourType("tour_video")).toEqual([]);
    expect(isTourTypeAvailable("tour_video", {})).toBe(true);
  });

  it("requires ElevenLabs for voice-over tours", () => {
    expect(getRequiredProviderKeysForTourType("tour_video_voice_over")).toEqual([
      "elevenlabs",
    ]);
    expect(getMissingProviderKeysForTourType("tour_video_voice_over", { heygen: true })).toEqual([
      "elevenlabs",
    ]);
    expect(isTourTypeAvailable("tour_video_voice_over", { elevenlabs: true })).toBe(true);
  });

  it("requires ElevenLabs and HeyGen for avatar tours", () => {
    expect(getRequiredProviderKeysForTourType("tour_video_avatar")).toEqual([
      "elevenlabs",
      "heygen",
    ]);
    expect(getMissingProviderKeysForTourType("tour_video_avatar", { heygen: true })).toEqual([
      "elevenlabs",
    ]);
    expect(getMissingProviderKeysForTourType("tour_video_avatar", { elevenlabs: true })).toEqual([
      "heygen",
    ]);
    expect(
      isTourTypeAvailable("tour_video_avatar", { elevenlabs: true, heygen: true })
    ).toBe(true);
  });
});
