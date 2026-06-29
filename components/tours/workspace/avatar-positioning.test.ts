import { describe, expect, test } from "vitest";

import { previewRectToProjectPosition, projectPositionToPreviewRect } from "./avatar-positioning";

describe("avatar positioning coordinate conversion", () => {
  test("converts CSS preview pixels to canonical 1080 x 1920 offsets", () => {
    expect(
      previewRectToProjectPosition({
        frameWidth: 270,
        frameHeight: 480,
        left: 135,
        top: 60,
        width: 125,
        height: 420,
      })
    ).toEqual({
      frame: { width: 1080, height: 1920 },
      offsets: { left: 540, top: 240, right: 40, bottom: 0 },
    });
  });

  test("preserves negative offsets when the avatar extends outside the preview frame", () => {
    expect(
      previewRectToProjectPosition({
        frameWidth: 270,
        frameHeight: 480,
        left: -20,
        top: -10,
        width: 180,
        height: 520,
      })
    ).toEqual({
      frame: { width: 1080, height: 1920 },
      offsets: { left: -80, top: -40, right: 440, bottom: -120 },
    });
  });

  test("converts committed canonical offsets back into preview state", () => {
    expect(
      projectPositionToPreviewRect({
        frameWidth: 270,
        frameHeight: 480,
        position: {
          frame: { width: 1080, height: 1920 },
          offsets: { left: 540, top: 240, right: 40, bottom: 0 },
        },
      })
    ).toEqual({
      frameWidth: 270,
      frameHeight: 480,
      left: 135,
      top: 60,
      width: 125,
      height: 420,
    });
  });
});
