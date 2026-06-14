import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/tour-render.contract";
import { TourRenderStatusPanel } from "./TourRenderStatusPanel";

afterEach(() => cleanup());

function completedRun(): TourRenderRunStatusResponse {
  return {
    id: "run-1",
    status: "completed",
    step: "completed",
    label: "Completed",
    timelineSteps: [
      { key: "queued", label: "Queued", detail: "Render request received" },
      { key: "uploading_final", label: "Uploading Final Video", detail: "Saving the generated tour" },
    ],
    progressPercent: 100,
    sceneClipCounts: {
      completed: 2,
      total: 2,
    },
    updatedAt: "2026-06-13T12:00:00.000Z",
    result: {
      assetId: "asset-final",
      downloadUrl: "https://storage.example.test/signed-final-video",
      storagePath: "user-1/project-1/run-1/final.mp4",
    },
    error: null,
    triggerRunId: "trigger-run-1",
  };
}

test("shows completed render download and done controls", async () => {
  const user = userEvent.setup();
  let doneClicks = 0;

  render(
    <TourRenderStatusPanel
      run={completedRun()}
      onDone={() => {
        doneClicks += 1;
      }}
    />
  );

  assert.ok(screen.getByText("Render Complete"));
  assert.ok(screen.getByRole("heading", { name: "Done" }));

  const download = screen.getByRole("link", { name: "Download video" });
  assert.equal(download.getAttribute("href"), "https://storage.example.test/signed-final-video");

  await user.click(screen.getByRole("button", { name: "Back to workspace" }));
  assert.equal(doneClicks, 1);
});
