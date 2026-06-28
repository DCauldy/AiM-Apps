import assert from "node:assert/strict";
import type React from "react";
import { afterEach, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TourProjectQaRenderLab } from "./TourProjectQaRenderLab";
import type { TourProjectType } from "@/lib/tours/projects/project-types";
import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/contracts/render.contract";
import { sanitizeTourRenderInvestigationOptions } from "@/lib/tours/rendering/options/render-options";
import type { TourRenderPromptPreviewProject } from "@/lib/tours/rendering/devtools/prompt-previews";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderQaRenderLab({
  isAvailable = true,
  includedSceneCount = 6,
  tourType = "tour_video",
  promptPreviewProject = promptProject,
  currentRun,
  onSubmitOptions,
}: {
  isAvailable?: boolean;
  includedSceneCount?: number;
  tourType?: TourProjectType;
  promptPreviewProject?: TourRenderPromptPreviewProject | null;
  currentRun?: TourRenderRunStatusResponse | null;
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
      currentRun={currentRun}
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

const persistedOptionsWithInternals = {
  renderMode: "provider_image_to_video",
  sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
  scriptPlanningModelId: "openrouter/planner",
  tourType: "tour_video_avatar",
  reuseExistingAssets: true,
  reuse: {
    scriptPlan: true,
    voiceover: true,
    avatar: true,
    sceneClips: false,
    finalVideo: false,
    transitions: false,
  },
  heyGenAvatarId: "avatar-secret",
  heyGenAvatarPositioning: { anchor: "bottom-right" },
  heyGenAvatarProjectPlacement: { frame: { width: 1080, height: 1920 } },
  heyGenAvatarGeneration: { engine: "v2" },
  elevenLabsVoiceId: "voice-secret",
  elevenLabsVoiceSettings: { stability: 0.5 },
  sceneClipRenderSettings: { width: 1920, height: 1080 },
  transitionDetectionModelId: "transition-model",
  finalMuxSettings: { videoCodec: "libx264" },
};

function renderRun(
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

function sanitizedRunFromPersistedInternals() {
  return renderRun({
    options: sanitizeTourRenderInvestigationOptions(
      persistedOptionsWithInternals,
    ),
  });
}

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
  assert.match(panel.className, /max-h-\[50vh\]/);
  assert.match(panel.className, /overflow-hidden/);
  assert.ok(screen.getByText("Preview/dev only"));
  const tabs = screen.getAllByRole("tab");
  assert.deepEqual(
    tabs.map((tab) => tab.textContent),
    ["Prompts", "Render", "Reuse", "Run cost", "Debug packet"],
  );
  assert.equal(tabs.at(-2)?.textContent, "Run cost");
  assert.equal(tabs.at(-1)?.textContent, "Debug packet");
  assert.ok(screen.getByRole("combobox", { name: "Render preset" }));
  assert.ok(screen.getByRole("switch", { name: "Script plan reuse" }));

  await user.click(screen.getByRole("tab", { name: "Run cost" }));
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
      "OpenRouter provider image-to-video is not expected because scene-clip reuse is requested.",
    ),
  );
  assert.ok(
    screen.getByText(
      "Local final muxing is not expected because final-video reuse is requested.",
    ),
  );

  await user.click(screen.getByRole("tab", { name: "Prompts" }));
  assert.ok(screen.getByRole("button", { name: "View Script Planner Prompt" }));
  assert.ok(screen.getByRole("button", { name: "View Image to Video Prompt" }));

  await user.click(screen.getByRole("tab", { name: "Render" }));
  assert.ok(screen.getByRole("combobox", { name: "Render mode" }));
  assert.ok(screen.getByLabelText("Provider scene clip model id"));
  assert.ok(screen.getByLabelText("Script planning model id"));

  await user.click(screen.getByRole("tab", { name: "Reuse" }));
  assert.ok(screen.getByRole("switch", { name: "Script plan reuse" }));

  await user.click(screen.getByRole("tab", { name: "Debug packet" }));
  assert.ok(
    screen.getByText(
      "No debug packet is available until a render lab run exists.",
    ),
  );
  assert.ok(screen.getByRole("button", { name: /Generate lab video/ }));
});

test("shows run details with parent Trigger.dev run id and persisted options", async () => {
  const user = userEvent.setup();

  renderQaRenderLab({ currentRun: sanitizedRunFromPersistedInternals() });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("tab", { name: "Debug packet" }));

  assert.ok(screen.getByText("Run investigation"));
  assert.ok(screen.getByText("project-1"));
  assert.ok(screen.getByText("trigger-run-1"));
  assert.ok(screen.getByText("running"));
  assert.ok(screen.getByText("rendering_scene_clips (Rendering Scene Clips)"));
  assert.ok(screen.getByText("$7.56 estimated - High provider spend"));

  await user.click(screen.getByText("Submitted/effective options"));

  assert.ok(
    screen.getByText(/"renderMode": "provider_image_to_video"/, {
      selector: "pre",
    }),
  );
  assert.match(
    (
      screen.getByLabelText(
        "Copyable render investigation packet",
      ) as HTMLTextAreaElement
    ).value,
    /Parent Trigger\.dev run id: trigger-run-1/,
  );
  const renderedOptions = screen.getByText(
    /"renderMode": "provider_image_to_video"/,
    {
      selector: "pre",
    },
  ).textContent;
  const exportPacket = (
    screen.getByLabelText(
      "Copyable render investigation packet",
    ) as HTMLTextAreaElement
  ).value;

  assert.doesNotMatch(renderedOptions ?? "", /avatar-secret|voice-secret/);
  assert.doesNotMatch(
    renderedOptions ?? "",
    /heyGenAvatar|elevenLabs|sceneClipRenderSettings|finalMuxSettings|transitionDetectionModelId/,
  );
  assert.doesNotMatch(exportPacket, /avatar-secret|voice-secret/);
  assert.doesNotMatch(
    exportPacket,
    /heyGenAvatar|elevenLabs|sceneClipRenderSettings|finalMuxSettings|transitionDetectionModelId/,
  );
});

test("shows missing Trigger.dev run id handling in run details", async () => {
  const user = userEvent.setup();

  renderQaRenderLab({ currentRun: renderRun({ triggerRunId: null }) });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("tab", { name: "Debug packet" }));

  assert.ok(screen.getAllByText("Not available").length >= 1);
  assert.match(
    (
      screen.getByLabelText(
        "Copyable render investigation packet",
      ) as HTMLTextAreaElement
    ).value,
    /Parent Trigger\.dev run id: Not available/,
  );
});

test("shows failed run errors and copies the investigation packet", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  renderQaRenderLab({
    currentRun: renderRun({
      status: "failed",
      step: "failed",
      label: "Failed",
      error: { message: "Scene clip rendering failed." },
    }),
  });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("tab", { name: "Debug packet" }));

  assert.ok(screen.getByText("Scene clip rendering failed."));
  await user.click(screen.getByRole("button", { name: "Copy packet" }));

  await waitFor(() => {
    assert.equal(writeText.mock.calls.length, 1);
  });
  assert.match(writeText.mock.calls[0]?.[0], /Status: failed/);
  assert.match(
    writeText.mock.calls[0]?.[0],
    /Error message: Scene clip rendering failed\./,
  );
  assert.ok(screen.getByRole("button", { name: "Copied" }));
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
  assert.equal(
    screen
      .getByRole("switch", { name: "Scene clips reuse" })
      .getAttribute("aria-checked"),
    "true",
  );
  assert.equal(
    screen
      .getByRole("switch", { name: "Final video reuse" })
      .getAttribute("aria-checked"),
    "false",
  );
  await user.click(screen.getByRole("button", { name: /Generate lab video/ }));

  assert.equal(onSubmitOptions.mock.calls.length, 1);
  assert.deepEqual(onSubmitOptions.mock.calls[0]?.[0], {
    renderMode: "provider_image_to_video",
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

test("render mode changes and selected model ids are reflected in submitted options", async () => {
  const user = userEvent.setup();
  const onSubmitOptions = vi.fn();

  renderQaRenderLab({ onSubmitOptions });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("tab", { name: "Render" }));
  await user.click(screen.getByRole("combobox", { name: "Render mode" }));
  await user.click(
    screen.getByRole("option", {
      name: "Provider image-to-video (provider_image_to_video)",
    }),
  );
  await user.click(
    screen.getByRole("combobox", { name: "Script planning model id" }),
  );
  await user.click(
    screen.getByRole("option", {
      name: "GPT-5 (openai/gpt-5)",
    }),
  );
  await user.click(
    screen.getByRole("combobox", { name: "Provider scene clip model id" }),
  );
  await user.click(
    screen.getByRole("option", {
      name: "Seedance 2.0 (bytedance/seedance-2.0)",
    }),
  );
  await user.click(screen.getByRole("button", { name: /Generate lab video/ }));

  assert.ok(screen.getAllByText("Custom").length >= 1);
  await user.click(screen.getByRole("tab", { name: "Reuse" }));
  assert.match(
    screen.getByRole("combobox", { name: "Render preset" }).textContent ?? "",
    /Custom/,
  );
  assert.equal(onSubmitOptions.mock.calls.length, 1);
  assert.equal(
    onSubmitOptions.mock.calls[0]?.[0].renderMode,
    "provider_image_to_video",
  );
  assert.equal(
    onSubmitOptions.mock.calls[0]?.[0].scriptPlanningModelId,
    "openai/gpt-5",
  );
  assert.equal(
    onSubmitOptions.mock.calls[0]?.[0].sceneClipProviderModelId,
    "bytedance/seedance-2.0",
  );
});

test("reuse toggles use on for reuse and off for regenerate", async () => {
  const user = userEvent.setup();
  const onSubmitOptions = vi.fn();

  renderQaRenderLab({ onSubmitOptions });

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("tab", { name: "Reuse" }));
  await user.click(screen.getByRole("switch", { name: "Scene clips reuse" }));
  await user.click(screen.getByRole("switch", { name: "Final video reuse" }));
  assert.match(
    screen.getByRole("combobox", { name: "Render preset" }).textContent ?? "",
    /Custom/,
  );
  await user.click(screen.getByRole("button", { name: /Generate lab video/ }));

  assert.ok(screen.getAllByText("Custom").length >= 1);
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
  await user.click(screen.getByRole("tab", { name: "Run cost" }));

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
  await user.click(screen.getByRole("tab", { name: "Prompts" }));
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
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(
    screen.getByRole("option", {
      name: "Cheap Ken Burns UX test",
    }),
  );
  await user.click(screen.getByRole("tab", { name: "Prompts" }));
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
  await user.click(screen.getByRole("tab", { name: "Prompts" }));
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
