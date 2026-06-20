import assert from "node:assert/strict";
import type React from "react";
import { afterEach, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TourProjectQaRenderLab } from "./TourProjectQaRenderLab";
import type { TourProjectType } from "@/lib/tours/project-types";
import type { TourRenderPromptPreviewProject } from "@/lib/tours/rendering/tour-render-prompt-previews";

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => undefined;
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

afterEach(() => {
  cleanup();
});

function renderQaRenderLab({
  isAvailable = true,
  includedSceneCount = 6,
  tourType = "tour_video",
  promptPreviewProject = promptProject,
  onSubmitOptions,
}: {
  isAvailable?: boolean;
  includedSceneCount?: number;
  tourType?: TourProjectType;
  promptPreviewProject?: TourRenderPromptPreviewProject | null;
  onSubmitOptions?: React.ComponentProps<
    typeof TourProjectQaRenderLab
  >["onSubmitOptions"];
} = {}) {
  return render(
    <TourProjectQaRenderLab
      isAvailable={isAvailable}
      includedSceneCount={includedSceneCount}
      tourType={tourType}
      promptPreviewProject={promptPreviewProject}
      onSubmitOptions={onSubmitOptions}
    />,
  );
}

const promptProject: TourRenderPromptPreviewProject = {
  id: "project-1",
  name: "Lake House Tour",
  propertyAddress: "123 Lake Road",
  listingUrl: null,
  tourType: "tour_video",
  scenes: [
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
          id: "photo-2",
          previewUrl: "https://signed.example/kitchen-detail.jpg",
        },
      ],
      facts: [
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

test("does not render when the server-authored availability signal is false", () => {
  renderQaRenderLab({ isAvailable: false });

  assert.equal(screen.queryByRole("button", { name: /QA Render Lab/ }), null);
});

test("renders a compact launcher with current estimated cost and dev-only popover", async () => {
  const user = userEvent.setup();

  renderQaRenderLab();

  const launcher = screen.getByRole("button", { name: /QA Render Lab/ });
  assert.match(launcher.className, /border-dotted/);
  assert.match(launcher.textContent ?? "", /\$0\.00 est, low/);
  assert.match(
    screen.getByTestId("tour-project-qa-render-lab").className,
    /fixed/,
  );

  await user.click(launcher);

  const panel = screen.getByRole("region", { name: "QA Render Lab" });
  assert.match(panel.className, /border-dotted/);
  assert.match(panel.className, /border-yellow-400/);
  assert.ok(screen.getByText("Preview/dev only"));
  assert.ok(screen.getByText("Provider spend estimate"));
  assert.ok(screen.getAllByText("$0.00").length >= 1);
  assert.ok(screen.getByText("Low provider spend"));
  assert.ok(
    screen.getByText(
      "OpenRouter script planning is not expected because script-plan reuse is requested.",
    ),
  );
  assert.ok(
    screen.getByText(
      "OpenRouter provider image-to-video is not expected because Ken Burns local rendering is selected.",
    ),
  );
  assert.ok(
    screen.getByText(
      "Local final muxing is not expected because final-video reuse is requested.",
    ),
  );
  assert.ok(screen.getByRole("combobox", { name: "Render preset" }));
  assert.ok(screen.getByRole("combobox", { name: "Render mode" }));
  assert.ok(screen.getByLabelText("Provider scene clip model id"));
  assert.ok(screen.getByLabelText("Script planning model id"));
  assert.ok(
    screen.getByRole("button", { name: "View Script Planner Prompt" }),
  );
  assert.ok(
    screen.getByRole("button", { name: "View Image to Video Prompt" }),
  );
  assert.ok(screen.getByRole("switch", { name: "Script plan reuse" }));
  assert.ok(screen.getByRole("button", { name: /Start render lab run/ }));
});

test("submits advanced options through the provided dev-tool callback", async () => {
  const user = userEvent.setup();
  const onSubmitOptions = vi.fn();

  renderQaRenderLab({ onSubmitOptions });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(
    screen.getByRole("option", { name: "Regenerate final video" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Start render lab run/ }),
  );

  assert.equal(onSubmitOptions.mock.calls.length, 1);
  assert.deepEqual(onSubmitOptions.mock.calls[0]?.[0], {
    renderMode: "ken_burns_ffmpeg",
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

test("render mode changes and blank model ids are reflected in submitted options", async () => {
  const user = userEvent.setup();
  const onSubmitOptions = vi.fn();

  renderQaRenderLab({ onSubmitOptions });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("combobox", { name: "Render mode" }));
  await user.click(
    screen.getByRole("option", {
      name: "Provider image-to-video (provider_image_to_video)",
    }),
  );
  await user.type(
    screen.getByLabelText("Script planning model id"),
    "  openrouter/planner  ",
  );
  await user.click(
    screen.getByRole("button", { name: /Start render lab run/ }),
  );

  assert.ok(screen.getByText("Custom"));
  assert.equal(onSubmitOptions.mock.calls.length, 1);
  assert.equal(
    onSubmitOptions.mock.calls[0]?.[0].renderMode,
    "provider_image_to_video",
  );
  assert.equal(
    onSubmitOptions.mock.calls[0]?.[0].scriptPlanningModelId,
    "openrouter/planner",
  );
  assert.equal(
    "sceneClipProviderModelId" in onSubmitOptions.mock.calls[0]?.[0],
    false,
  );
});

test("reuse toggles use on for reuse and off for regenerate", async () => {
  const user = userEvent.setup();
  const onSubmitOptions = vi.fn();

  renderQaRenderLab({ onSubmitOptions });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("switch", { name: "Scene clips reuse" }));
  await user.click(screen.getByRole("switch", { name: "Final video reuse" }));
  await user.click(
    screen.getByRole("button", { name: /Start render lab run/ }),
  );

  assert.ok(screen.getByText("Custom"));
  assert.deepEqual(onSubmitOptions.mock.calls[0]?.[0].reuse, {
    scriptPlan: true,
    voiceover: true,
    avatar: true,
    sceneClips: false,
    finalVideo: false,
  });
});

test("updates expanded estimate dollars when provider image-to-video regeneration is selected", async () => {
  const user = userEvent.setup();

  renderQaRenderLab({ includedSceneCount: 6 });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(
    screen.getByRole("option", {
      name: "Provider image-to-video quality experiment",
    }),
  );

  assert.ok(screen.getAllByText("$7.56").length >= 1);
  assert.ok(screen.getByText("High provider spend"));
  assert.ok(
    screen.getByText(
      "OpenRouter provider image-to-video is expected for 6 scene clip(s) with kwaivgi/kling-v3.0-std.",
    ),
  );
});

test("opens and closes a formatted script planner prompt modal", async () => {
  const user = userEvent.setup();

  renderQaRenderLab();

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(
    screen.getByRole("button", { name: "View Script Planner Prompt" }),
  );

  const dialog = screen.getByRole("dialog", {
    name: "Script Planner Prompt",
  });
  assert.ok(dialog);
  assert.ok(screen.getByText("System Prompt"));
  assert.ok(screen.getByText("User Prompt"));
  assert.ok(
    screen.getByText(/Create a scene-ordered tour script plan/, {
      selector: "pre",
    }),
  );
  assert.ok(screen.getByText(/Quartz waterfall island/, { selector: "pre" }));

  await user.click(
    screen.getByRole("button", { name: "Close prompt preview" }),
  );

  assert.equal(
    screen.queryByRole("dialog", { name: "Script Planner Prompt" }),
    null,
  );
});

test("shows an unavailable image-to-video prompt state until provider mode is selected", async () => {
  const user = userEvent.setup();

  renderQaRenderLab();

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(
    screen.getByRole("button", { name: "View Image to Video Prompt" }),
  );

  assert.ok(
    screen.getByText(
      "Image-to-video prompt preview is unavailable while Ken Burns FFmpeg mode is selected.",
    ),
  );
});

test("opens formatted image-to-video prompt details in provider mode", async () => {
  const user = userEvent.setup();

  renderQaRenderLab();

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(
    screen.getByRole("option", {
      name: "Provider image-to-video quality experiment",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "View Image to Video Prompt" }),
  );

  assert.ok(screen.getByRole("dialog", { name: "Image To Video Prompt" }));
  assert.ok(screen.getByText("Provider Prompt"));
  assert.ok(screen.getByText("Request Details"));
  assert.ok(screen.getByText(/through Kitchen/, { selector: "pre" }));
  assert.ok(
    screen.getByText(/secondary_reference_count: 1/, { selector: "pre" }),
  );
});
