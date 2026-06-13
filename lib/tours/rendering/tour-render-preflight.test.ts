import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { preflightTourRender, type TourRenderOptions } from "./tour-render-preflight";
import type { TourRenderPreflightProject, TourRenderRepository } from "./tour-render.repository";

const baseProject: TourRenderPreflightProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Local Seed Tour",
    propertyAddress: "123 Local Seed Lane",
    listingUrl: "https://example.com/listing",
    tourType: "tour_video",
    status: "open",
  },
  scenes: [
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 0,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: {
        id: "photo-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        width: 1600,
        height: 900,
      },
      proofedFacts: [],
    },
  ],
};

function createRepository(project: TourRenderPreflightProject | null = baseProject) {
  return {
    getTourRenderPreflightProject: vi.fn().mockResolvedValue(project),
    canReadListingMedia: vi.fn().mockResolvedValue(true),
    canWriteGeneratedMedia: vi.fn().mockResolvedValue(true),
  } as Partial<TourRenderRepository> as TourRenderRepository;
}

async function runPreflight(
  repository: TourRenderRepository,
  options: TourRenderOptions = {},
  providerKeys: Partial<Record<"elevenlabs" | "heygen", boolean>> = {}
) {
  return preflightTourRender(
    {
      projectId: "project-1",
      userId: "user-1",
      options,
    },
    {
      repository,
      getProviderKeyStatusMap: vi.fn().mockResolvedValue(providerKeys),
    }
  );
}

describe("preflightTourRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns a summary when the project is renderable", async () => {
    const repository = createRepository();

    await expect(runPreflight(repository)).resolves.toEqual({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 0,
        requiredProviderKeys: [],
      },
    });
    expect(repository.canReadListingMedia).toHaveBeenCalledWith({
      storagePaths: ["user-1/project-1/kitchen.jpg"],
    });
    expect(repository.canWriteGeneratedMedia).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "project-1",
    });
  });

  test("blocks when the project cannot be loaded for the user", async () => {
    const repository = createRepository(null);

    await expect(runPreflight(repository)).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: "project_not_found",
          message: "Tour Project was not found or is not available to this account.",
          severity: "blocking",
        },
      ],
    });
    expect(repository.canWriteGeneratedMedia).not.toHaveBeenCalled();
  });

  test("blocks archived projects and projects with no included scenes", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, status: "archived" },
      scenes: [{ ...baseProject.scenes[0], included: false }],
    });

    await expect(runPreflight(repository)).resolves.toMatchObject({
      ok: false,
      issues: [
        { code: "project_archived", severity: "blocking" },
        { code: "no_included_scenes", severity: "blocking" },
      ],
    });
  });

  test("blocks every included scene without an authoritative source photo", async () => {
    const repository = createRepository({
      ...baseProject,
      scenes: [{ ...baseProject.scenes[0], authoritativePhoto: null }],
    });

    await expect(runPreflight(repository)).resolves.toMatchObject({
      ok: false,
      issues: [
        {
          code: "missing_authoritative_source_photo",
          severity: "blocking",
          sceneId: "scene-1",
        },
      ],
    });
  });

  test("requires ElevenLabs only for voice-over tours", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_voice_over" },
    });

    await expect(runPreflight(repository, {}, { heygen: true })).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_elevenlabs_key", severity: "blocking" }],
    });
  });

  test("requires ElevenLabs and HeyGen for avatar tours", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_avatar" },
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1" }, { elevenlabs: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_heygen_key", severity: "blocking" }],
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1" }, { heygen: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_elevenlabs_key", severity: "blocking" }],
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1" }, { elevenlabs: true, heygen: true })
    ).resolves.toMatchObject({
      ok: true,
      summary: {
        requiredProviderKeys: ["elevenlabs", "heygen"],
      },
    });
  });

  test("requires a configured HeyGen avatar id for avatar tours", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_avatar" },
    });

    await expect(
      runPreflight(repository, {}, { elevenlabs: true, heygen: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_heygen_avatar_id", severity: "blocking" }],
    });
  });

  test("blocks provider image-to-video until the production adapter is enabled", async () => {
    const repository = createRepository();

    await expect(
      runPreflight(repository, { renderMode: "provider_image_to_video" })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "unsupported_render_mode", severity: "blocking" }],
    });
  });

  test("blocks unreadable listing media and unwritable generated media storage", async () => {
    const repository = createRepository();
    vi.mocked(repository.canReadListingMedia).mockResolvedValue(false);
    vi.mocked(repository.canWriteGeneratedMedia).mockResolvedValue(false);

    await expect(runPreflight(repository)).resolves.toMatchObject({
      ok: false,
      issues: [
        { code: "listing_media_unreadable", severity: "blocking" },
        { code: "generated_media_unwritable", severity: "blocking" },
      ],
    });
  });
});
