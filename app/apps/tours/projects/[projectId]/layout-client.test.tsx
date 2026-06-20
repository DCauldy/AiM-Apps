import assert from "node:assert/strict";
import type React from "react";
import { afterEach, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  TourProjectWorkspaceViewModel,
  TourScene,
} from "@/lib/tours/workspace";
import { TourProjectLayoutClient } from "./layout-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function tourScene(overrides: Partial<TourScene>): TourScene {
  const included = overrides.included ?? true;

  return {
    id: "scene-1",
    title: "Kitchen",
    sortOrder: 0,
    included,
    cameraMotion: "auto",
    authoritativePhoto: {
      id: "photo-1",
      fileName: "kitchen.jpg",
      storagePath: "project-1/kitchen.jpg",
      contentType: "image/jpeg",
      previewUrl: null,
    },
    sourcePhotos: [],
    facts: [],
    hasProofedContext: false,
    status: included ? "ready" : "skipped",
    ...overrides,
  };
}

function workspaceViewModel(
  overrides: Partial<TourProjectWorkspaceViewModel> = {},
): TourProjectWorkspaceViewModel {
  return {
    project: {
      id: "project-1",
      name: "Lake House Tour",
      lifecycleStatus: "open",
      tourType: "tour_video",
      elevenLabsVoiceId: null,
      heyGenAvatarId: null,
      heyGenAvatarPlacement: null,
      createdAt: "2026-06-13T12:00:00.000Z",
      updatedAt: "2026-06-13T12:00:00.000Z",
    },
    listing: {
      address: "123 Lake Road",
      listingUrl: null,
    },
    ownership: {
      canEdit: true,
    },
    listingMediaAuthorization: {
      acknowledgementCopy: "I confirm I am authorized to use the listing media.",
      hasAcknowledged: true,
      acknowledgedAt: "2026-06-13T12:00:00.000Z",
    },
    tourScenes: [],
    readiness: {
      media: "not_started",
      scenePlan: "not_started",
      approvals: "not_started",
      narration: "not_started",
      export: "not_started",
    },
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

test("project layout renders the QA render lab from the server-authored page signal", () => {
  renderWithProviders(
    <TourProjectLayoutClient
      initialViewModel={workspaceViewModel()}
      isQaRenderLabAvailable
    >
      <main>Project workspace body</main>
    </TourProjectLayoutClient>
  );

  assert.ok(screen.getByText("Project workspace body"));
  const launcher = screen.getByRole("button", { name: /QA Render Lab/ });
  assert.match(launcher.textContent ?? "", /\$0\.00 est, low/);
});

test("QA render lab estimate ignores skipped scenes from the workspace", async () => {
  const user = userEvent.setup();
  const viewModel = workspaceViewModel({
    tourScenes: [
      tourScene({ id: "scene-1", included: true, status: "ready" }),
      tourScene({ id: "scene-2", included: true, status: "ready" }),
      tourScene({ id: "scene-3", included: false, status: "skipped" }),
    ],
  });

  renderWithProviders(
    <TourProjectLayoutClient
      initialViewModel={viewModel}
      isQaRenderLabAvailable
    >
      <main>Project workspace body</main>
    </TourProjectLayoutClient>,
  );

  await user.click(screen.getByRole("button", { name: /QA Render Lab/ }));
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(
    screen.getByRole("option", {
      name: "Provider image-to-video quality experiment",
    }),
  );

  assert.ok(screen.getByText(/Estimate uses 2 included scenes at 10s per clip/));
  assert.ok(screen.getAllByText("$2.52").length >= 1);
  assert.equal(screen.queryByText("$3.78"), null);
});

test("project layout keeps normal workspace controls and hides the QA lab when unavailable", () => {
  renderWithProviders(
    <TourProjectLayoutClient
      initialViewModel={workspaceViewModel()}
      isQaRenderLabAvailable={false}
    >
      <main>Project workspace body</main>
    </TourProjectLayoutClient>
  );

  assert.ok(screen.getByRole("button", { name: /Generate video/ }));
  assert.equal(screen.queryByRole("button", { name: /QA Render Lab/ }), null);
});
