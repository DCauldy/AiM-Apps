import { z } from "zod";
import type { TourProjectType } from "../projects/project-types";
import {
  getRequiredSettingsValidationError,
  getTourProjectSettingsColumnsForSave,
} from "../projects/project-configuration";

export type HeyGenAvatarProjectPosition = {
  frame: { width: 1080; height: 1920 };
  offsets: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
};

const AVATAR_POSITION_FRAME = { width: 1080, height: 1920 } as const;
const MAX_ABSOLUTE_AVATAR_OFFSET = 3840;

export const OptionalHeyGenAvatarIdSchema = z
  .preprocess((value) => (value === null ? "" : value), z.string().trim().max(200, "HeyGen avatar ID is too long").optional())
  .transform((value) => (value ? value : null));

export const HeyGenAvatarProjectPositionSchema: z.ZodType<HeyGenAvatarProjectPosition> = z
  .object({
    frame: z.object({
      width: z.literal(AVATAR_POSITION_FRAME.width),
      height: z.literal(AVATAR_POSITION_FRAME.height),
    }),
    offsets: z.object({
      top: z.number().finite().int().min(-MAX_ABSOLUTE_AVATAR_OFFSET).max(MAX_ABSOLUTE_AVATAR_OFFSET),
      left: z.number().finite().int().min(-MAX_ABSOLUTE_AVATAR_OFFSET).max(MAX_ABSOLUTE_AVATAR_OFFSET),
      bottom: z.number().finite().int().min(-MAX_ABSOLUTE_AVATAR_OFFSET).max(MAX_ABSOLUTE_AVATAR_OFFSET),
      right: z.number().finite().int().min(-MAX_ABSOLUTE_AVATAR_OFFSET).max(MAX_ABSOLUTE_AVATAR_OFFSET),
    }),
  })
  .superRefine((position, ctx) => {
    const avatarWidth = position.frame.width - position.offsets.left - position.offsets.right;
    const avatarHeight = position.frame.height - position.offsets.top - position.offsets.bottom;

    if (avatarWidth <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offsets", "right"],
        message: "Avatar placement must leave a positive visible width.",
      });
    }

    if (avatarHeight <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offsets", "bottom"],
        message: "Avatar placement must leave a positive visible height.",
      });
    }
  });

export const OptionalHeyGenAvatarProjectPositionSchema = z
  .preprocess((value) => (value === null ? undefined : value), HeyGenAvatarProjectPositionSchema.optional())
  .transform((value) => value ?? null);

export type TourProjectAvatarSettings = {
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
};

export type TourProjectAvatarSettingsColumns = {
  heygen_avatar_id: string | null;
  heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
};

export function getAvatarSettingsValidationError(input: {
  tourType: TourProjectType;
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): string | null {
  return getRequiredSettingsValidationError(input);
}

export function getAvatarSettingsColumnsForSave(input: {
  tourType: TourProjectType;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
}): TourProjectAvatarSettingsColumns {
  const columns = getTourProjectSettingsColumnsForSave({
    tourType: input.tourType,
    elevenLabsVoiceId: null,
    heyGenAvatarId: input.heyGenAvatarId,
    heyGenAvatarPlacement: input.heyGenAvatarPlacement,
  });

  return {
    heygen_avatar_id: columns.heygen_avatar_id,
    heygen_avatar_placement: columns.heygen_avatar_placement,
  };
}
