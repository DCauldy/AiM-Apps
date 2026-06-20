import { describe, expect, test } from "vitest";

import {
  buildOpenRouterScriptPlanPrompt,
  buildOpenRouterScriptPlanSystemPrompt,
  TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
} from "./openrouter-script-planning-prompts";
import { buildOpenRouterSceneClipPrompt } from "./openrouter-scene-clip-prompts";
import {
  buildTourRenderImageToVideoPromptPreview,
  buildTourRenderScriptPlannerPromptPreview,
  type TourRenderPromptPreviewProject,
} from "./tour-render-prompt-previews";

const project: TourRenderPromptPreviewProject = {
  id: "project-1",
  name: "Lake House Tour",
  propertyAddress: "123 Lake Road",
  listingUrl: "https://example.test/listing",
  tourType: "tour_video",
  scenes: [
    {
      id: "scene-2",
      title: "Bedroom",
      sortOrder: 2,
      included: false,
      cameraMotion: "static_hold",
      authoritativePhoto: { id: "photo-2", previewUrl: null },
      sourcePhotos: [],
      facts: [],
    },
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: {
        id: "photo-1",
        previewUrl: "https://signed.example/kitchen.jpg",
      },
      sourcePhotos: [
        { id: "photo-1", previewUrl: "https://signed.example/kitchen.jpg" },
        {
          id: "photo-3",
          previewUrl: "https://signed.example/kitchen-detail.jpg",
        },
      ],
      facts: [
        {
          id: "fact-2",
          text: "Do not include this suggestion",
          sourcePhotoId: null,
          proofStatus: "suggested",
          sortOrder: 2,
        },
        {
          id: "fact-1",
          text: "Quartz waterfall island",
          sourcePhotoId: "photo-1",
          proofStatus: "proofed",
          sortOrder: 1,
        },
      ],
    },
  ],
};

describe("tour render prompt previews", () => {
  test("renders the script planner prompt through the provider prompt helpers", () => {
    const preview = buildTourRenderScriptPlannerPromptPreview({
      project,
      options: { scriptPlanningModelId: "openrouter/planner-model" },
    });

    expect(preview.available).toBe(true);
    if (!preview.available) throw new Error("expected available preview");

    expect(preview.description).toContain("openrouter/planner-model");
    expect(preview.sections[0]).toEqual({
      label: "System Prompt",
      content: buildOpenRouterScriptPlanSystemPrompt(),
    });
    expect(preview.sections[1]).toEqual({
      label: "User Prompt",
      content: buildOpenRouterScriptPlanPrompt({
        project: {
          id: "project-1",
          name: "Lake House Tour",
          propertyAddress: "123 Lake Road",
          listingUrl: "https://example.test/listing",
          tourType: "tour_video",
        },
        scenes: [
          {
            id: "scene-1",
            title: "Kitchen",
            cameraMotion: "slow_push",
            proofedFacts: [
              {
                text: "Quartz waterfall island",
              },
            ],
          },
        ],
        promptVersion: TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
        timing: {
          fallbackDurationSeconds: 5,
          minDurationSeconds: 3,
          maxDurationSeconds: 9,
        },
      }),
    });
    expect(preview.sections[1]?.content).not.toContain(
      "Do not include this suggestion",
    );
  });

  test("renders image-to-video prompt details through the provider prompt helper", () => {
    const preview = buildTourRenderImageToVideoPromptPreview({
      project,
      options: {
        renderMode: "provider_image_to_video",
        sceneClipProviderModelId: "kwaivgi/kling-v3.0-pro",
      },
    });

    expect(preview.available).toBe(true);
    if (!preview.available) throw new Error("expected available preview");

    expect(preview.description).toContain("Kitchen");
    expect(preview.sections[0]).toEqual({
      label: "Provider Prompt",
      content: buildOpenRouterSceneClipPrompt({
        scene: { title: "Kitchen", cameraMotion: "slow_push" },
        secondarySourceImageUrls: [
          "https://signed.example/kitchen-detail.jpg",
        ],
      }),
    });
    expect(preview.sections[1]?.content).toContain(
      "model: kwaivgi/kling-v3.0-pro",
    );
    expect(preview.sections[1]?.content).toContain(
      "secondary_reference_count: 1",
    );
  });

  test("returns unavailable states when prompt inputs cannot be computed", () => {
    expect(
      buildTourRenderScriptPlannerPromptPreview({
        project: { ...project, scenes: [] },
        options: {},
      }),
    ).toEqual({
      available: false,
      title: "Script Planner Prompt",
      message:
        "Script planner prompt preview is unavailable until the project has at least one included scene.",
    });

    expect(
      buildTourRenderImageToVideoPromptPreview({
        project,
        options: { renderMode: "ken_burns_ffmpeg" },
      }),
    ).toEqual({
      available: false,
      title: "Image To Video Prompt",
      message:
        "Image-to-video prompt preview is unavailable while Ken Burns FFmpeg mode is selected.",
    });
  });
});
