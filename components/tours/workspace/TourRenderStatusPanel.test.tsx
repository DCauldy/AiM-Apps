import assert from "node:assert/strict";
import type React from "react";
import { afterEach, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/tour-render.contract";
import { appendDownloadTitle, TourRenderStatusPanel } from "./TourRenderStatusPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function completedRun(): TourRenderRunStatusResponse {
  return {
    id: "run-1",
    projectId: "project-1",
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
    options: {},
  };
}

function failedRun(): TourRenderRunStatusResponse {
  return {
    ...completedRun(),
    status: "failed",
    step: "failed",
    label: "Failed",
    progressPercent: 68,
    sceneClipCounts: {
      completed: 0,
      total: 2,
    },
    result: null,
    error: {
      message: "Scene clip rendering failed.",
    },
  };
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

test("shows completed render download and done controls", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ assets: [] })
  );
  const user = userEvent.setup();
  let doneClicks = 0;

  renderWithQueryClient(
    <TourRenderStatusPanel
      run={completedRun()}
      downloadTitle="Lake House Tour"
      onDone={() => {
        doneClicks += 1;
      }}
    />
  );

  assert.ok(screen.getByText("Render Complete"));
  assert.ok(screen.getByRole("heading", { name: "Done" }));

  const download = screen.getByRole("link", { name: "Download video" });
  assert.equal(
    download.getAttribute("href"),
    "https://storage.example.test/signed-final-video?download=Lake+House+Tour.mp4"
  );

  await user.click(screen.getByRole("button", { name: "Back to workspace" }));
  assert.equal(doneClicks, 1);
});

test("shows failed render error message", () => {
  renderWithQueryClient(<TourRenderStatusPanel run={failedRun()} />);

  assert.ok(screen.getByText("Scene clip rendering failed."));
});

test("communicates when historical intermediate assets are no longer downloadable", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ assets: [] })
  );

  renderWithQueryClient(<TourRenderStatusPanel run={completedRun()} />);

  const assetsButton = await screen.findByRole("button", {
    name: /Assets expired for download\s*Expired Jul 13, 2026/,
  });

  assert.equal(assetsButton.hasAttribute("disabled"), true);
  assert.equal(screen.queryByText("No downloadable intermediate assets remain for this render."), null);
  assert.equal(screen.queryAllByRole("link", { name: /^Download / }).length, 1);
});

test("shows downloadable asset count and retention date when assets remain", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      assets: [
        {
          id: "asset-json",
          name: "script-plan.json",
          url: "https://storage.example.test/script-plan.json?token=abc",
          contentType: "application/json",
        },
      ],
    })
  );
  const user = userEvent.setup();

  renderWithQueryClient(<TourRenderStatusPanel run={completedRun()} />);

  const assetsButton = await screen.findByRole("button", {
    name: /View 1 downloadable asset\s*Expires Jul 13, 2026/,
  });
  assert.equal(assetsButton.hasAttribute("disabled"), false);

  await user.click(assetsButton);

  const assetDownload = screen.getByRole("link", { name: "Download script-plan.json" });
  assert.equal(
    assetDownload.getAttribute("href"),
    "https://storage.example.test/script-plan.json?token=abc"
  );
});

test("appends download title without dropping signed URL params", () => {
  assert.equal(
    appendDownloadTitle("https://storage.example.test/final.mp4?token=abc", "Listing Video"),
    "https://storage.example.test/final.mp4?token=abc&download=Listing+Video.mp4"
  );
});
