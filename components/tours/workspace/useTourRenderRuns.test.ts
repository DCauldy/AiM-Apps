import assert from "node:assert/strict";
import { test } from "vitest";

import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/tour-render.contract";
import {
  FRESH_RENDER_OPTIONS,
  buildCreateRenderRunRequestBody,
  pickLatestDownloadableRenderRun,
} from "./useTourRenderRuns";

function renderRun(
  overrides: Partial<TourRenderRunStatusResponse> = {}
): TourRenderRunStatusResponse {
  return {
    id: "run-1",
    status: "running",
    step: "rendering_scene_clips",
    label: "Rendering scene clips",
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
    ...overrides,
  };
}

test("picks the newest completed render with a download URL", () => {
  const olderDownloadableRun = renderRun({
    id: "run-older",
    status: "completed",
    result: {
      assetId: "asset-older",
      downloadUrl: "https://storage.example.test/older",
    },
  });
  const newestDownloadableRun = renderRun({
    id: "run-newest",
    status: "completed",
    result: {
      assetId: "asset-newest",
      downloadUrl: "https://storage.example.test/newest",
    },
  });

  assert.equal(
    pickLatestDownloadableRenderRun([
      renderRun({ id: "run-active" }),
      newestDownloadableRun,
      olderDownloadableRun,
    ]),
    newestDownloadableRun
  );
});

test("ignores completed renders without signed download URLs", () => {
  assert.equal(
    pickLatestDownloadableRenderRun([
      renderRun({
        id: "run-completed-without-url",
        status: "completed",
        result: { assetId: "asset-final" },
      }),
    ]),
    null
  );
});

test("fresh render options disable reuse for every generated asset", () => {
  assert.deepEqual(FRESH_RENDER_OPTIONS, {
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

test("fresh render request body sends reuse disabled without overriding render mode", () => {
  const body = buildCreateRenderRunRequestBody({ fresh: true });

  assert.deepEqual(body, {
    options: FRESH_RENDER_OPTIONS,
  });
  assert.equal("options" in body && "renderMode" in body.options, false);
});

test("default render request body leaves reuse options unset", () => {
  assert.deepEqual(buildCreateRenderRunRequestBody({ fresh: false }), {});
});
