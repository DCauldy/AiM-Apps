import { describe, expect, test } from "vitest";
import { OptionalElevenLabsVoiceIdSchema } from "./project-configuration.schema";

describe("tour project configuration schemas", () => {
  test("normalizes optional ElevenLabs voice ids", () => {
    expect(OptionalElevenLabsVoiceIdSchema.parse(undefined)).toBeNull();
    expect(OptionalElevenLabsVoiceIdSchema.parse(null)).toBeNull();
    expect(OptionalElevenLabsVoiceIdSchema.parse("  voice-1  ")).toBe("voice-1");
  });
});
