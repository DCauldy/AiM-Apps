import type React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/tours/workspace/ElevenLabsVoiceSelector", () => ({
  ElevenLabsVoiceSelector: ({ onChange }: { onChange: (voiceId: string) => void }) => (
    <button type="button" onClick={() => onChange("voice-1")}>
      Select test voice
    </button>
  ),
}));

import { CreateTourProjectForm } from "./CreateTourProjectForm";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/apps/tours/avatars") {
      return Response.json({
        avatars: [
          {
            id: "avatar-look-1",
            name: "Main Digital Twin",
            avatarType: "digital_twin",
            groupId: "group-1",
            gender: "female",
            previewImageUrl: "https://example.test/avatar.jpg",
            previewVideoUrl: null,
            tags: ["business"],
            supportedApiEngines: ["vega"],
            status: "completed",
          },
        ],
      });
    }

    if (url === "/api/apps/tours/projects" && init?.method === "POST") {
      return Response.json({ projectId: "project-1" }, { status: 201 });
    }

    return Response.json({ error: "Unexpected request" }, { status: 500 });
  });
}

beforeEach(() => {
  mocks.push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

test("shows the HeyGen avatar field only for avatar tours", async () => {
  mockFetch();
  const user = userEvent.setup();

  renderWithQueryClient(<CreateTourProjectForm canUseElevenLabs canUseHeyGen />);

  await user.click(screen.getByRole("button", { name: /start property/i }));
  expect(screen.queryByText("HeyGen avatar look")).toBeNull();

  await user.click(screen.getByText("Avatar Tour"));
  expect(screen.getByText("HeyGen avatar look")).toBeInTheDocument();
});

test("selects a look, submits its id, and supplies the default placement", async () => {
  const fetchMock = mockFetch();
  const user = userEvent.setup();

  renderWithQueryClient(<CreateTourProjectForm canUseElevenLabs canUseHeyGen />);

  await user.click(screen.getByRole("button", { name: /start property/i }));
  await user.type(screen.getByLabelText(/project name/i), "Lake House Tour");
  await user.type(screen.getByLabelText(/property address/i), "123 Lake Road");
  await user.click(screen.getByText("Avatar Tour"));
  await user.click(screen.getByRole("button", { name: "Select test voice" }));
  await user.click(screen.getByRole("button", { name: /choose heygen avatar/i }));
  await user.click(await screen.findByRole("button", { name: /main digital twin/i }));
  fireEvent.change(screen.getByRole("slider", { name: /avatar scale/i }), { target: { value: "1" } });
  await user.click(screen.getByRole("button", { name: /use avatar/i }));
  await user.click(screen.getByRole("button", { name: /create project/i }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/apps/tours/projects/project-1"));
  const postCall = fetchMock.mock.calls.find(
    ([url, init]) => String(url) === "/api/apps/tours/projects" && init?.method === "POST"
  );
  expect(postCall).toBeTruthy();
  expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
    name: "Lake House Tour",
    propertyAddress: "123 Lake Road",
    tourType: "tour_video_avatar",
    elevenLabsVoiceId: "voice-1",
    heyGenAvatarId: "avatar-look-1",
    heyGenAvatarPlacement: {
      frame: { width: 1080, height: 1920 },
      offsets: { top: 1380, left: 120, bottom: 0, right: 0 },
    },
  });
});

test("blocks create submit when avatar tour has no selected avatar", async () => {
  const fetchMock = mockFetch();
  const user = userEvent.setup();

  renderWithQueryClient(<CreateTourProjectForm canUseElevenLabs canUseHeyGen />);

  await user.click(screen.getByRole("button", { name: /start property/i }));
  await user.click(screen.getByText("Avatar Tour"));
  await user.click(screen.getByRole("button", { name: "Select test voice" }));

  expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/apps/tours/projects",
    expect.objectContaining({ method: "POST" })
  );
});

test("canceling avatar positioning does not overwrite the committed draft", async () => {
  const fetchMock = mockFetch();
  const user = userEvent.setup();

  renderWithQueryClient(<CreateTourProjectForm canUseElevenLabs canUseHeyGen />);

  await user.click(screen.getByRole("button", { name: /start property/i }));
  await user.type(screen.getByLabelText(/project name/i), "Lake House Tour");
  await user.type(screen.getByLabelText(/property address/i), "123 Lake Road");
  await user.click(screen.getByText("Avatar Tour"));
  await user.click(screen.getByRole("button", { name: "Select test voice" }));
  await user.click(screen.getByRole("button", { name: /choose heygen avatar/i }));
  await user.click(await screen.findByRole("button", { name: /main digital twin/i }));
  await user.click(screen.getAllByRole("button", { name: /cancel/i })[0]);

  expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/apps/tours/projects",
    expect.objectContaining({ method: "POST" })
  );
});

test("switching away from avatar tour clears avatar draft before submit", async () => {
  const fetchMock = mockFetch();
  const user = userEvent.setup();

  renderWithQueryClient(<CreateTourProjectForm canUseElevenLabs canUseHeyGen />);

  await user.click(screen.getByRole("button", { name: /start property/i }));
  await user.type(screen.getByLabelText(/project name/i), "Lake House Tour");
  await user.type(screen.getByLabelText(/property address/i), "123 Lake Road");
  await user.click(screen.getByText("Avatar Tour"));
  await user.click(screen.getByRole("button", { name: "Select test voice" }));
  await user.click(screen.getByRole("button", { name: /choose heygen avatar/i }));
  await user.click(await screen.findByRole("button", { name: /main digital twin/i }));
  await user.click(screen.getByRole("button", { name: /use avatar/i }));
  await user.click(screen.getByText("Tour Video"));
  await user.click(screen.getByRole("button", { name: /create project/i }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/apps/tours/projects/project-1"));
  const postCall = fetchMock.mock.calls.find(
    ([url, init]) => String(url) === "/api/apps/tours/projects" && init?.method === "POST"
  );
  const body = JSON.parse(String(postCall?.[1]?.body));
  expect(body.tourType).toBe("tour_video");
  expect(body).not.toHaveProperty("heyGenAvatarId");
  expect(body).not.toHaveProperty("heyGenAvatarPlacement");
});
