import assert from "node:assert/strict";
import { test } from "vitest";

import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/contracts/render.contract";
import {
  FRESH_RENDER_OPTIONS,
  buildCreateRenderRunRequestBody,
  isFreshRenderRunInput,
  isOptionsRenderRunInput,
  isPlainReuseRenderRunInput,
  pickLatestDownloadableRenderRun,
} from "./useTourRenderRuns";
import { toursApiRoutes } from "../tours-api-client";

function renderRun(
  overrides: Partial<TourRenderRunStatusResponse> = {},
): TourRenderRunStatusResponse {
  return {
    id: "run-1",
    projectId: "project-1",
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
    options: {},
    ...overrides,
  };
}

test("picks the newest completed render with a result asset", () => {
  const olderDownloadableRun = renderRun({
    id: "run-older",
    status: "completed",
    result: {
      assetId: "asset-older",
    },
  });
  const newestDownloadableRun = renderRun({
    id: "run-newest",
    status: "completed",
    result: {
      assetId: "asset-newest",
    },
  });

  assert.equal(
    pickLatestDownloadableRenderRun([
      renderRun({ id: "run-active" }),
      newestDownloadableRun,
      olderDownloadableRun,
    ]),
    newestDownloadableRun,
  );
});

test("ignores completed renders without result assets", () => {
  assert.equal(
    pickLatestDownloadableRenderRun([
      renderRun({
        id: "run-completed-without-result",
        status: "completed",
        result: null,
      }),
    ]),
    null,
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

test("creation state helpers keep plain reuse renders separate from options renders", () => {
  const optionsInput = {
    fresh: false,
    options: {
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: false,
        finalVideo: false,
      },
    },
  };

  assert.equal(isPlainReuseRenderRunInput({ fresh: false }), true);
  assert.equal(isPlainReuseRenderRunInput(), true);
  assert.equal(isPlainReuseRenderRunInput({ fresh: true }), false);
  assert.equal(isPlainReuseRenderRunInput(optionsInput), false);

  assert.equal(isFreshRenderRunInput({ fresh: true }), true);
  assert.equal(isFreshRenderRunInput(optionsInput), false);

  assert.equal(isOptionsRenderRunInput(optionsInput), true);
  assert.equal(isOptionsRenderRunInput({ fresh: false }), false);
  assert.equal(
    isOptionsRenderRunInput({ fresh: true, options: optionsInput.options }),
    false,
  );
});

test("dev-tool render request body sends explicit options", () => {
  assert.deepEqual(
    buildCreateRenderRunRequestBody({
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
    }),
    {
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
    },
  );
});

test("cancel render route targets the project-scoped render run", () => {
  assert.equal(
    toursApiRoutes.renderRunCancel("project 1", "run/1"),
    "/api/apps/tours/projects/project%201/render-runs/run%2F1/cancel",
  );
});
