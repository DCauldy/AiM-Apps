import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RenderableTourProject } from "../repositories/tour-render.repository";
import type { TourScriptPlan } from "./tour-script-planning";
import { applyScriptPlannedTransitionEffects } from "./generate-tour-project-video.helpers";

const project: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Demo Listing",
    propertyAddress: "123 Main St",
    listingUrl: null,
    tourType: "tour_video",
  },
  scenes: [
    {
      id: "scene-auto",
      title: "Kitchen",
      sortOrder: 0,
      included: true,
      cameraMotion: "slow_push",
      transitionEffect: "auto",
      authoritativePhoto: {
        id: "photo-1",
        storagePath: "project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        width: 1600,
        height: 900,
        priority: 0,
      },
      sourcePhotos: [],
      proofedFacts: [],
    },
    {
      id: "scene-user",
      title: "Living Room",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      transitionEffect: "fade",
      authoritativePhoto: {
        id: "photo-2",
        storagePath: "project-1/living.jpg",
        fileName: "living.jpg",
        contentType: "image/jpeg",
        byteSize: 456,
        width: 1600,
        height: 900,
        priority: 0,
      },
      sourcePhotos: [],
      proofedFacts: [],
    },
  ],
};

const scriptPlan: TourScriptPlan = {
  fullScript: "Welcome home.",
  sceneTimings: [
    {
      sceneId: "scene-auto",
      scriptText: "Welcome home.",
      selectedTransitionEffect: "cross-blur",
      durationSeconds: 5,
    },
    {
      sceneId: "scene-user",
      scriptText: "The living room opens up.",
      selectedTransitionEffect: "whip-pan",
      durationSeconds: 5,
    },
  ],
  model: "test-model",
};

describe("applyScriptPlannedTransitionEffects", () => {
  test("uses planner choices only for auto scenes", () => {
    const result = applyScriptPlannedTransitionEffects(project, scriptPlan);

    expect(result.scenes.find((scene) => scene.id === "scene-auto")?.transitionEffect).toBe(
      "cross-blur"
    );
    expect(result.scenes.find((scene) => scene.id === "scene-user")?.transitionEffect).toBe(
      "fade"
    );
  });
});
