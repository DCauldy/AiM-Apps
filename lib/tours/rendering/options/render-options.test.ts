import { describe, expect, test } from "vitest";

import {
  TOUR_RENDER_PRESETS,
  buildTourRenderOptionsFromAdvancedControls,
  getTourRenderOptionsForPreset,
  parseTourRenderOptionsInput,
  sanitizeTourRenderInvestigationOptions,
} from "./render-options";

describe("tour render preset options", () => {
  test("maps every V1 preset to deterministic supported options", () => {
    expect(TOUR_RENDER_PRESETS).toEqual([
      "reuse_everything_possible",
      "regenerate_scene_clips",
      "regenerate_final_video",
      "cheap_ken_burns_ux_test",
      "provider_image_to_video_quality_experiment",
      "script_model_experiment",
      "full_fresh_render",
    ]);

    for (const preset of TOUR_RENDER_PRESETS) {
      const options = getTourRenderOptionsForPreset(preset);

      expect(parseTourRenderOptionsInput(options)).toEqual({
        ok: true,
        options,
      });
    }
  });

  test("maps reuse everything possible with every supported reuse toggle on", () => {
    expect(getTourRenderOptionsForPreset("reuse_everything_possible")).toEqual({
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: true,
        finalVideo: true,
      },
    });
  });

  test("maps regeneration presets with toggle-on meaning reuse this asset", () => {
    expect(getTourRenderOptionsForPreset("regenerate_scene_clips")).toEqual({
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: false,
        finalVideo: false,
      },
    });
    expect(getTourRenderOptionsForPreset("regenerate_final_video")).toEqual({
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: true,
        finalVideo: false,
      },
    });
  });

  test("maps render mode experiment presets", () => {
    expect(getTourRenderOptionsForPreset("cheap_ken_burns_ux_test")).toEqual({
      renderMode: "ken_burns_ffmpeg",
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: false,
        finalVideo: false,
      },
    });
    expect(
      getTourRenderOptionsForPreset(
        "provider_image_to_video_quality_experiment",
      ),
    ).toEqual({
      renderMode: "provider_image_to_video",
      sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: false,
        finalVideo: false,
      },
    });
  });

  test("maps script and full fresh presets", () => {
    expect(getTourRenderOptionsForPreset("script_model_experiment")).toEqual({
      scriptPlanningModelId: "google/gemini-2.5-flash",
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: false,
        voiceover: false,
        avatar: false,
        sceneClips: false,
        finalVideo: false,
      },
    });
    expect(getTourRenderOptionsForPreset("full_fresh_render")).toEqual({
      reuseExistingAssets: false,
      reuse: {
        scriptPlan: false,
        voiceover: false,
        avatar: false,
        sceneClips: false,
        finalVideo: false,
      },
    });
  });
});

describe("advanced tour render controls", () => {
  test("builds explicit render options from advanced control state", () => {
    expect(
      buildTourRenderOptionsFromAdvancedControls({
        renderMode: "provider_image_to_video",
        sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
        scriptPlanningModelId: "openrouter/planner-model",
        sceneTransitionEffect: "swipe-on-top",
        reuse: {
          scriptPlan: true,
          voiceover: true,
          avatar: false,
          sceneClips: false,
          finalVideo: true,
        },
      }),
    ).toEqual({
      renderMode: "provider_image_to_video",
      sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
      scriptPlanningModelId: "openrouter/planner-model",
      sceneTransitions: { effect: "swipe-on-top" },
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: false,
        sceneClips: false,
        finalVideo: true,
      },
    });
  });

  test("omits blank model id overrides from advanced control options", () => {
    expect(
      buildTourRenderOptionsFromAdvancedControls({
        renderMode: "ken_burns_ffmpeg",
        sceneClipProviderModelId: "   ",
        scriptPlanningModelId: "\n\t",
        sceneTransitionEffect: "swipe-on-top",
        reuse: {
          scriptPlan: false,
          voiceover: false,
          avatar: false,
          sceneClips: false,
          finalVideo: false,
        },
      }),
    ).toEqual({
      renderMode: "ken_burns_ffmpeg",
      sceneTransitions: { effect: "swipe-on-top" },
      reuseExistingAssets: false,
      reuse: {
        scriptPlan: false,
        voiceover: false,
        avatar: false,
        sceneClips: false,
        finalVideo: false,
      },
    });
  });
});

describe("tour render investigation options", () => {
  test("keeps only the V1 debug-safe option subset", () => {
    expect(
      sanitizeTourRenderInvestigationOptions({
        renderMode: "provider_image_to_video",
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: false,
          avatar: true,
          sceneClips: false,
          finalVideo: true,
          transitions: false,
        },
        scriptPlanningModelId: "  openrouter/planner  ",
        sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
        sceneTransitions: { effect: "swipe-on-top" },
        tourType: "tour_video_avatar",
        heyGenAvatarId: "avatar-secret",
        heyGenAvatarPositioning: { anchor: "bottom-right" },
        heyGenAvatarProjectPlacement: { frame: { width: 1080, height: 1920 } },
        heyGenAvatarGeneration: { engine: "v2" },
        elevenLabsVoiceId: "voice-secret",
        elevenLabsVoiceSettings: { stability: 0.5 },
        sceneClipRenderSettings: { width: 1920, height: 1080 },
        transitionDetectionModelId: "transition-model",
        finalMuxSettings: { videoCodec: "libx264" },
      }),
    ).toEqual({
      renderMode: "provider_image_to_video",
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: false,
        avatar: true,
        sceneClips: false,
        finalVideo: true,
      },
      scriptPlanningModelId: "openrouter/planner",
      sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
      sceneTransitions: { effect: "swipe-on-top" },
      tourType: "tour_video_avatar",
    });
  });

  test("rejects unsupported scene transition effects", () => {
    expect(
      parseTourRenderOptionsInput({
        sceneTransitions: {
          effect: "cross-dissolve",
        },
      }),
    ).toEqual({
      ok: true,
      options: { sceneTransitions: { effect: "cross-dissolve" } },
    });

    expect(
      parseTourRenderOptionsInput({
        sceneTransitions: {
          effect: "auto",
        },
      }),
    ).toEqual({
      ok: false,
      errors: ["sceneTransitions.effect must be a supported scene transition effect."],
    });

    expect(
      parseTourRenderOptionsInput({
        sceneTransitions: {
          effect: "dip-to-black",
        },
      }),
    ).toEqual({
      ok: false,
      errors: ["sceneTransitions.effect must be a supported scene transition effect."],
    });
  });
});
