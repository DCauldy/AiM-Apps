import type { TourProjectType } from "./project-types";

export type TourProviderKey = "elevenlabs" | "heygen";

export type TourProviderKeyStatusMap = Partial<Record<TourProviderKey, boolean>>;

export function getRequiredProviderKeysForTourType(
  tourType: TourProjectType
): TourProviderKey[] {
  if (tourType === "tour_video_voice_over") {
    return ["elevenlabs"];
  }

  if (tourType === "tour_video_avatar") {
    return ["elevenlabs", "heygen"];
  }

  return [];
}

export function getMissingProviderKeysForTourType(
  tourType: TourProjectType,
  keyStatus: TourProviderKeyStatusMap
): TourProviderKey[] {
  return getRequiredProviderKeysForTourType(tourType).filter((key) => keyStatus[key] !== true);
}

export function isTourTypeAvailable(
  tourType: TourProjectType,
  keyStatus: TourProviderKeyStatusMap
): boolean {
  return getMissingProviderKeysForTourType(tourType, keyStatus).length === 0;
}

export function getTourTypeAvailabilityMessage(
  tourType: TourProjectType,
  action: "creating" | "choosing" = "choosing"
): string | null {
  if (tourType === "tour_video_voice_over") {
    return `Add an ElevenLabs API key before ${action} a voice over tour.`;
  }

  if (tourType === "tour_video_avatar") {
    return `Add ElevenLabs and HeyGen API keys before ${action} a video avatar tour.`;
  }

  return null;
}
