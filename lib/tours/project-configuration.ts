import type { TourProjectType } from "./project-types";
import type { HeyGenAvatarProjectPosition } from "./avatar-project-settings";

export type TourProjectConfiguration = {
  supportsVoiceSelection: boolean;
  supportsAvatarSettings: boolean;
  requiresVoiceSelection: boolean;
  requiresAvatarSettings: boolean;
};

export type TourProjectSettings = {
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
};

export type TourProjectSettingsColumns = {
  elevenlabs_voice_id: string | null;
  heygen_avatar_id: string | null;
  heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
};

export function getTourProjectConfiguration(
  tourType: TourProjectType
): TourProjectConfiguration {
  const supportsVoiceSelection =
    tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
  const supportsAvatarSettings = tourType === "tour_video_avatar";

  return {
    supportsVoiceSelection,
    supportsAvatarSettings,
    requiresVoiceSelection: supportsVoiceSelection,
    requiresAvatarSettings: supportsAvatarSettings,
  };
}

export function getRequiredSettingsValidationError(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): string | null {
  const configuration = getTourProjectConfiguration(input.tourType);

  if (configuration.requiresVoiceSelection && !input.elevenLabsVoiceId) {
    return input.tourType === "tour_video_avatar"
      ? "Select an ElevenLabs digital twin voice before saving this avatar project."
      : "Select an ElevenLabs digital twin voice before saving this project.";
  }

  if (!configuration.requiresAvatarSettings) {
    return null;
  }

  if (!input.heyGenAvatarId) {
    return "Select a HeyGen avatar before saving this avatar project.";
  }

  if (!input.heyGenAvatarPlacement) {
    return "Position the HeyGen avatar before saving this avatar project.";
  }

  return null;
}

export function getRequiredSettingsState(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}) {
  const configuration = getTourProjectConfiguration(input.tourType);

  return {
    isVoiceSelectionMissing:
      configuration.requiresVoiceSelection && !input.elevenLabsVoiceId?.trim(),
    isAvatarSelectionMissing:
      configuration.requiresAvatarSettings &&
      (!input.heyGenAvatarId?.trim() || !input.heyGenAvatarPlacement),
  };
}

export function normalizeTourProjectSettings(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): TourProjectSettings {
  const configuration = getTourProjectConfiguration(input.tourType);

  return {
    elevenLabsVoiceId: configuration.supportsVoiceSelection ? input.elevenLabsVoiceId : null,
    heyGenAvatarId: configuration.supportsAvatarSettings ? input.heyGenAvatarId : null,
    heyGenAvatarPlacement: configuration.supportsAvatarSettings
      ? input.heyGenAvatarPlacement
      : null,
  };
}

export function getTourProjectSettingsColumnsForSave(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): TourProjectSettingsColumns {
  const settings = normalizeTourProjectSettings(input);

  return {
    elevenlabs_voice_id: settings.elevenLabsVoiceId,
    heygen_avatar_id: settings.heyGenAvatarId,
    heygen_avatar_placement: settings.heyGenAvatarPlacement,
  };
}

export function getTourProjectSettingsPayloadForCreate(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): Partial<TourProjectSettings> {
  const configuration = getTourProjectConfiguration(input.tourType);
  const payload: Partial<TourProjectSettings> = {};

  if (configuration.supportsVoiceSelection) {
    payload.elevenLabsVoiceId = input.elevenLabsVoiceId;
  }
  if (configuration.supportsAvatarSettings) {
    payload.heyGenAvatarId = input.heyGenAvatarId;
    payload.heyGenAvatarPlacement = input.heyGenAvatarPlacement;
  }

  return payload;
}

export function getChangedTourProjectSettingsForUpdate(input: {
  tourType: TourProjectType;
  currentSettings: TourProjectSettings;
  updates: Partial<TourProjectSettings>;
}): Partial<TourProjectSettingsColumns> {
  const rawSettings = {
    elevenLabsVoiceId:
      input.updates.elevenLabsVoiceId !== undefined
        ? input.updates.elevenLabsVoiceId
        : input.currentSettings.elevenLabsVoiceId,
    heyGenAvatarId:
      input.updates.heyGenAvatarId !== undefined
        ? input.updates.heyGenAvatarId
        : input.currentSettings.heyGenAvatarId,
    heyGenAvatarPlacement:
      input.updates.heyGenAvatarPlacement !== undefined
        ? input.updates.heyGenAvatarPlacement
        : input.currentSettings.heyGenAvatarPlacement,
  };
  const normalizedSettings = normalizeTourProjectSettings({
    tourType: input.tourType,
    ...rawSettings,
  });
  const columns: Partial<TourProjectSettingsColumns> = {};

  if (normalizedSettings.elevenLabsVoiceId !== input.currentSettings.elevenLabsVoiceId) {
    columns.elevenlabs_voice_id = normalizedSettings.elevenLabsVoiceId;
  }
  if (normalizedSettings.heyGenAvatarId !== input.currentSettings.heyGenAvatarId) {
    columns.heygen_avatar_id = normalizedSettings.heyGenAvatarId;
  }
  if (normalizedSettings.heyGenAvatarPlacement !== input.currentSettings.heyGenAvatarPlacement) {
    columns.heygen_avatar_placement = normalizedSettings.heyGenAvatarPlacement;
  }

  return columns;
}
