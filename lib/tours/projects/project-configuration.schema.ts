import { z } from "zod";

export const OptionalElevenLabsVoiceIdSchema = z
  .preprocess((value) => (value === null ? "" : value), z.string().trim().max(120, "Voice ID is too long").optional())
  .transform((value) => (value ? value : null));
