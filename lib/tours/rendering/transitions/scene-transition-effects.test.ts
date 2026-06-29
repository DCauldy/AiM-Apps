import { describe, expect, test } from "vitest";

import {
  DEFAULT_SCENE_TRANSITION_EFFECT,
  RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS,
  SCENE_TRANSITION_EFFECT_OPTIONS,
  buildSceneTransitionJoinArgs,
  isSceneTransitionEffect,
  isResolvedSceneTransitionEffect,
  resolveSceneTransitionEffectSettings,
} from "./scene-transition-effects";

describe("scene transition effects", () => {
  test("accepts only canonical public transition ids", () => {
    expect(SCENE_TRANSITION_EFFECT_OPTIONS.map((option) => option.value)).toEqual([
      "auto",
      "swipe-on-top",
      "cross-dissolve",
      "fade",
      "cross-blur",
      "cross-zoom",
      "iris",
      "soft-wipe",
      "split-reveal",
      "whip-pan",
    ]);

    for (const option of SCENE_TRANSITION_EFFECT_OPTIONS) {
      expect(isSceneTransitionEffect(option.value)).toBe(true);
    }
    expect(DEFAULT_SCENE_TRANSITION_EFFECT).toBe("auto");
    expect(isResolvedSceneTransitionEffect("auto")).toBe(false);
    expect(RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS[0]).toEqual(
      expect.objectContaining({
        value: "swipe-on-top",
        label: "Swipe on top",
        description: expect.any(String),
        useCase: expect.any(String),
      })
    );

    for (const alias of [
      "dip-to-black",
      "iris-open",
      "soft-swipe",
      "push-left",
      "cover-from-left",
      "split-reveal-horizontal",
      "whip-pan-right",
      "light-leak",
    ]) {
      expect(isSceneTransitionEffect(alias)).toBe(false);
    }
  });

  test("uses the incoming scene transition effect for each boundary", () => {
    const args = buildSceneTransitionJoinArgs({
      sceneClipPaths: ["scene-1.mp4", "scene-2.mp4", "scene-3.mp4"],
      handlePlans: [
        {
          sceneId: "scene-1",
          index: 0,
          totalSceneCount: 3,
          targetDurationSeconds: 4,
          requestedDurationSeconds: 4.5,
          incomingHandleSeconds: 0,
          outgoingHandleSeconds: 0.5,
        },
        {
          sceneId: "scene-2",
          index: 1,
          totalSceneCount: 3,
          targetDurationSeconds: 4,
          requestedDurationSeconds: 5,
          incomingHandleSeconds: 0.5,
          outgoingHandleSeconds: 0.5,
        },
        {
          sceneId: "scene-3",
          index: 2,
          totalSceneCount: 3,
          targetDurationSeconds: 4,
          requestedDurationSeconds: 4.5,
          incomingHandleSeconds: 0.5,
          outgoingHandleSeconds: 0,
        },
      ],
      sceneTransitionEffects: ["fade", "soft-wipe", "whip-pan"],
      transitionSettings: resolveSceneTransitionEffectSettings(),
      width: 1080,
      height: 1920,
      fps: 30,
      videoCodec: "libx264",
      preset: "medium",
      crf: 20,
      outputPath: "joined.mp4",
    });
    const filterComplex = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filterComplex).toContain("xfade=transition=smoothleft");
    expect(filterComplex).toContain("xfade=transition=slideleft");
    expect(filterComplex).toContain("avgblur=sizeX=28");
    expect(filterComplex).not.toContain("fade=t=out");
  });
});
