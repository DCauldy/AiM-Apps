import assert from "node:assert/strict";
import type React from "react";
import { afterEach, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";

import type { TourProjectWorkspaceViewModel } from "@/lib/tours/workspace";
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

function workspaceViewModel(): TourProjectWorkspaceViewModel {
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
  assert.ok(screen.getByRole("button", { name: "QA Render Lab" }));
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
  assert.equal(screen.queryByRole("button", { name: "QA Render Lab" }), null);
});
