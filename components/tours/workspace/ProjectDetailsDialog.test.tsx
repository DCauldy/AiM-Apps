import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectDetailsDialog, type ProjectDetailsForm } from "./WorkspacePresentation";

vi.mock("@/components/tours/workspace/ElevenLabsVoiceSelector", () => ({
  ElevenLabsVoiceSelector: ({ value, onChange }: { value: string; onChange: (voiceId: string) => void }) => (
    <button type="button" onClick={() => onChange("voice-2")}>
      Voice selector {value}
    </button>
  ),
}));

const initialPlacement = {
  frame: { width: 1080 as const, height: 1920 as const },
  offsets: { top: 240, left: 540, bottom: 0, right: 40 },
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockAvatarFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      avatars: [
        {
          id: "avatar-look-1",
          name: "Main Digital Twin",
          avatarType: "digital_twin",
          groupId: "group-1",
          gender: "female",
          previewImageUrl: "https://example.test/avatar-1.jpg",
          previewVideoUrl: null,
          tags: ["business"],
          supportedApiEngines: ["vega"],
          status: "completed",
        },
        {
          id: "avatar-look-2",
          name: "Second Look",
          avatarType: "digital_twin",
          groupId: "group-1",
          gender: "female",
          previewImageUrl: "https://example.test/avatar-2.jpg",
          previewVideoUrl: null,
          tags: [],
          supportedApiEngines: ["vega"],
          status: "completed",
        },
      ],
    })
  );
}

function DialogHarness({
  initialDetails,
  onSubmitDetails,
}: {
  initialDetails: ProjectDetailsForm;
  onSubmitDetails: (details: ProjectDetailsForm) => void;
}) {
  const [details, setDetails] = React.useState(initialDetails);
  return (
    <ProjectDetailsDialog
      open
      details={details}
      showVoiceId
      showAvatarSettings
      error={null}
      isSaving={false}
      onOpenChange={() => undefined}
      onChange={setDetails}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmitDetails(details);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

test("loads existing avatar id and placement into the edit draft", async () => {
  mockAvatarFetch();

  renderWithQueryClient(
    <DialogHarness
      initialDetails={{
        name: "Lake House Tour",
        propertyAddress: "123 Lake Road",
        listingUrl: "",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: initialPlacement,
      }}
      onSubmitDetails={vi.fn()}
    />
  );

  expect(await screen.findByText("Main Digital Twin")).toBeInTheDocument();
});

test("edits avatar look and placement before saving", async () => {
  mockAvatarFetch();
  const user = userEvent.setup();
  const onSubmitDetails = vi.fn();

  renderWithQueryClient(
    <DialogHarness
      initialDetails={{
        name: "Lake House Tour",
        propertyAddress: "123 Lake Road",
        listingUrl: "",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: initialPlacement,
      }}
      onSubmitDetails={onSubmitDetails}
    />
  );

  await user.click(await screen.findByRole("button", { name: /choose heygen avatar/i }));
  await user.click(await screen.findByRole("button", { name: /second look/i }));
  fireEvent.change(screen.getByRole("slider", { name: /avatar scale/i }), { target: { value: "1" } });
  await user.click(screen.getByRole("button", { name: /use avatar/i }));
  await user.click(screen.getByRole("button", { name: /save details/i }));

  await waitFor(() => expect(onSubmitDetails).toHaveBeenCalled());
  expect(onSubmitDetails.mock.calls[0][0]).toMatchObject({
    heyGenAvatarId: "avatar-look-2",
    heyGenAvatarPlacement: {
      frame: { width: 1080, height: 1920 },
      offsets: { top: 1380, left: 120, bottom: 0, right: 0 },
    },
  });
});

test("prevents saving an avatar project without avatar placement", () => {
  mockAvatarFetch();

  renderWithQueryClient(
    <DialogHarness
      initialDetails={{
        name: "Lake House Tour",
        propertyAddress: "123 Lake Road",
        listingUrl: "",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: null,
      }}
      onSubmitDetails={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: /save details/i })).toBeDisabled();
  expect(screen.getByText("Select and position a HeyGen avatar before saving.")).toBeInTheDocument();
});
