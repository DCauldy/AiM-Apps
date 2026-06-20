import assert from "node:assert/strict";
import { test } from "vitest";

import type { TourRenderRunStatusResponse } from "../contracts/tour-render.contract";
import { formatTourRenderInvestigationExport } from "./tour-render-investigation-export";
import { estimateTourProviderSpend } from "../spend/tour-render-provider-spend";
import type { TourRenderOptions } from "../preflight/tour-render-preflight";

function run(
  overrides: Partial<TourRenderRunStatusResponse> = {},
): TourRenderRunStatusResponse {
  return {
    id: "run-1",
    projectId: "project-1",
    status: "running",
    step: "rendering_scene_clips",
    label: "Rendering Scene Clips",
    timelineSteps: [],
    progressPercent: 40,
    sceneClipCounts: {
      completed: 1,
      total: 3,
    },
    updatedAt: "2026-06-13T12:00:00.000Z",
    result: null,
    error: null,
    triggerRunId: "trigger-run-1",
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
    ...overrides,
  };
}

test("formats compact render investigation details with ids, options, and spend estimate", () => {
  const renderRun = run();
  const exportText = formatTourRenderInvestigationExport({
    projectId: "project-1",
    run: renderRun,
    providerSpendEstimate: estimateTourProviderSpend({
      includedSceneCount: 3,
      tourType: "tour_video",
      options: renderRun.options as TourRenderOptions,
    }),
  });

  assert.match(exportText, /## Tour Render Run Investigation/);
  assert.match(exportText, /Project id: project-1/);
  assert.match(exportText, /Render run id: run-1/);
  assert.match(exportText, /Parent Trigger\.dev run id: trigger-run-1/);
  assert.match(exportText, /Status: running/);
  assert.match(
    exportText,
    /Current step: rendering_scene_clips \(Rendering Scene Clips\)/,
  );
  assert.match(exportText, /"renderMode": "provider_image_to_video"/);
  assert.match(exportText, /\$3\.78 estimated - High provider spend/);
  assert.match(exportText, /OpenRouter Provider scene clips: \$3\.78/);
});

test("formats missing Trigger.dev run id without dropping the field", () => {
  const renderRun = run({ triggerRunId: null });
  const exportText = formatTourRenderInvestigationExport({
    projectId: "project-1",
    run: renderRun,
    providerSpendEstimate: estimateTourProviderSpend({
      includedSceneCount: 1,
      tourType: "tour_video",
      options: renderRun.options as TourRenderOptions,
    }),
  });

  assert.match(exportText, /Parent Trigger\.dev run id: Not available/);
});

test("formats failed run error details", () => {
  const renderRun = run({
    status: "failed",
    step: "failed",
    label: "Failed",
    error: { message: "Scene clip rendering failed." },
  });
  const exportText = formatTourRenderInvestigationExport({
    projectId: "project-1",
    run: renderRun,
    providerSpendEstimate: estimateTourProviderSpend({
      includedSceneCount: 1,
      tourType: "tour_video",
      options: renderRun.options as TourRenderOptions,
    }),
  });

  assert.match(exportText, /Status: failed/);
  assert.match(exportText, /Error message: Scene clip rendering failed\./);
});
