import { describe, expect, test } from "vitest";

import { estimateTourProviderSpend } from "./tour-render-provider-spend";

describe("tour provider spend estimator", () => {
  test("estimates cheap reuse with dollar details", () => {
    const estimate = estimateTourProviderSpend({
      includedSceneCount: 6,
      tourType: "tour_video",
      options: {
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: true,
          avatar: true,
          sceneClips: true,
          finalVideo: true,
        },
      },
    });

    expect(estimate.risk).toBe("low");
    expect(estimate.estimatedTotalUsd).toBe(0);
    expect(estimate.summary).toContain("$0.00 estimated");
    expect(estimate.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter_script_planning",
          estimatedCostUsd: 0,
        }),
        expect.objectContaining({
          id: "local_final_mux",
          estimatedCostUsd: 0,
        }),
      ]),
    );
  });

  test("estimates full fresh scene regeneration dollars", () => {
    const estimate = estimateTourProviderSpend({
      includedSceneCount: 6,
      tourType: "tour_video",
      options: {
        reuseExistingAssets: false,
        reuse: {
          scriptPlan: false,
          voiceover: false,
          avatar: false,
          sceneClips: false,
          finalVideo: false,
        },
      },
    });

    expect(estimate.risk).toBe("low");
    expect(estimate.estimatedTotalUsd).toBe(0.02);
    expect(estimate.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter_script_planning",
          estimatedCostUsd: 0.02,
        }),
        expect.objectContaining({
          id: "local_ken_burns",
          estimatedCostUsd: 0,
        }),
      ]),
    );
  });

  test("keeps Ken Burns scene regeneration visibly cheaper than provider clips", () => {
    const kenBurnsEstimate = estimateTourProviderSpend({
      includedSceneCount: 6,
      tourType: "tour_video",
      options: {
        renderMode: "ken_burns_ffmpeg",
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: true,
          avatar: true,
          sceneClips: false,
          finalVideo: false,
        },
      },
    });
    const providerEstimate = estimateTourProviderSpend({
      includedSceneCount: 6,
      tourType: "tour_video",
      options: {
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
      },
    });

    expect(kenBurnsEstimate.risk).toBe("low");
    expect(kenBurnsEstimate.estimatedTotalUsd).toBe(0);
    expect(providerEstimate.risk).toBe("high");
    expect(providerEstimate.estimatedTotalUsd).toBe(7.56);
    expect(providerEstimate.estimatedTotalUsd).toBeGreaterThan(
      kenBurnsEstimate.estimatedTotalUsd,
    );
  });

  test("estimates provider image-to-video scene regeneration by model seconds", () => {
    const estimate = estimateTourProviderSpend({
      includedSceneCount: 3,
      tourType: "tour_video",
      options: {
        renderMode: "provider_image_to_video",
        sceneClipProviderModelId: "kwaivgi/kling-v3.0-pro",
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: true,
          avatar: true,
          sceneClips: false,
          finalVideo: false,
        },
      },
    });

    expect(estimate.risk).toBe("high");
    expect(estimate.estimatedTotalUsd).toBe(5.04);
    expect(estimate.assumptions.clipSeconds).toBe(10);
    expect(estimate.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter_scene_clips",
          estimatedCostUsd: 5.04,
        }),
      ]),
    );
  });

  test("adds ElevenLabs dollars for voiceover tours", () => {
    const estimate = estimateTourProviderSpend({
      includedSceneCount: 5,
      tourType: "tour_video_voice_over",
      options: {
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: false,
          avatar: true,
          sceneClips: true,
          finalVideo: false,
        },
      },
    });

    expect(estimate.risk).toBe("low");
    expect(estimate.estimatedTotalUsd).toBe(0.21);
    expect(estimate.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "elevenlabs_voiceover",
          estimatedCostUsd: 0.21,
        }),
      ]),
    );
  });

  test("adds ElevenLabs and HeyGen dollars for avatar tours", () => {
    const estimate = estimateTourProviderSpend({
      includedSceneCount: 6,
      tourType: "tour_video_avatar",
      options: {
        reuseExistingAssets: true,
        reuse: {
          scriptPlan: true,
          voiceover: false,
          avatar: false,
          sceneClips: true,
          finalVideo: false,
        },
      },
    });

    expect(estimate.risk).toBe("moderate");
    expect(estimate.estimatedTotalUsd).toBe(1.25);
    expect(estimate.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "elevenlabs_voiceover",
          estimatedCostUsd: 0.25,
        }),
        expect.objectContaining({
          id: "heygen_avatar",
          estimatedCostUsd: 1,
        }),
      ]),
    );
  });
});
