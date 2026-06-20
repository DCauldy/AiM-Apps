import { describe, expect, test } from "vitest";

import {
  mergeProjectAvatarSettingsIntoRenderOptions,
  normalizeProjectAvatarPosition,
} from "./avatar-project-render-options";

const placement = {
  frame: { width: 1080 as const, height: 1920 as const },
  offsets: { top: 240, left: 540, bottom: 120, right: 40 },
};

describe("project avatar render options", () => {
  test("normalizes right-side project offsets into current render positioning", () => {
    expect(normalizeProjectAvatarPosition(placement)).toEqual({
      anchor: "bottom-right",
      rightMargin: 40,
      bottomMargin: 120,
      basis: "videoLayer",
      avatarWidth: 500,
      alphaThreshold: 16,
    });
  });

  test("normalizes left-side project offsets into bottom-left anchoring", () => {
    expect(
      normalizeProjectAvatarPosition({
        frame: { width: 1080, height: 1920 },
        offsets: { top: 240, left: 40, bottom: -80, right: 540 },
      })
    ).toEqual({
      anchor: "bottom-left",
      rightMargin: 40,
      bottomMargin: -80,
      basis: "videoLayer",
      avatarWidth: 500,
      alphaThreshold: 16,
    });
  });

  test("merges project avatar settings while preserving explicit per-run overrides", () => {
    expect(
      mergeProjectAvatarSettingsIntoRenderOptions({
        options: {
          heyGenAvatarId: "explicit-avatar",
          heyGenAvatarPositioning: {
            anchor: "bottom-left",
            rightMargin: 0,
            bottomMargin: 9,
            basis: "videoLayer",
          },
        },
        project: {
          heyGenAvatarId: "project-avatar",
          heyGenAvatarPlacement: placement,
        },
      })
    ).toEqual({
      heyGenAvatarId: "explicit-avatar",
      heyGenAvatarPositioning: {
        anchor: "bottom-left",
        rightMargin: 0,
        bottomMargin: 9,
        basis: "videoLayer",
      },
      heyGenAvatarProjectPlacement: placement,
    });
  });
});
