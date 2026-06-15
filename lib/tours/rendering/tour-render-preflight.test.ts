import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { preflightTourRender, type TourRenderOptions } from "./tour-render-preflight";
import type { TourRenderPreflightProject, TourRenderRepository } from "./tour-render.repository";

const avatarPlacement = {
  frame: { width: 1080 as const, height: 1920 as const },
  offsets: { top: 240, left: 540, bottom: 0, right: 40 },
};

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
    createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
      {
        storagePath: "user-1/project-1/kitchen.jpg",
        signedUrl: "https://provider.example.test/storage/v1/object/sign/kitchen.jpg",
      },
    ]),
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
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 206 })),
      getProviderKeyStatusMap: vi.fn().mockResolvedValue(providerKeys),
      // Stub out the resolver so the test doesn't reach into Supabase
      // for the project→profile_id lookup.
      resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
    }
  );
}

describe("preflightTourRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_VOICE_ID = "voice-1";
    delete process.env.TOURS_RENDER_MODE;
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

  test("uses TOURS_RENDER_MODE as the default render mode", async () => {
    process.env.TOURS_RENDER_MODE = "provider_image_to_video";
    const repository = createRepository();

    await expect(runPreflight(repository)).resolves.toEqual({
      ok: true,
      summary: expect.objectContaining({
        renderMode: "provider_image_to_video",
      }),
    });
  });

  test("lets explicit render options override TOURS_RENDER_MODE", async () => {
    process.env.TOURS_RENDER_MODE = "provider_image_to_video";
    const repository = createRepository();

    await expect(
      runPreflight(repository, { renderMode: "ken_burns_ffmpeg" })
    ).resolves.toEqual({
      ok: true,
      summary: expect.objectContaining({
        renderMode: "ken_burns_ffmpeg",
      }),
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

  test("requires an ElevenLabs voice id for voice-over tours", async () => {
    delete process.env.ELEVENLABS_VOICE_ID;
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_voice_over" },
    });

    await expect(runPreflight(repository, {}, { elevenlabs: true })).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_elevenlabs_voice_id", severity: "blocking" }],
    });
  });

  test("requires ElevenLabs and HeyGen for avatar tours", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_avatar" },
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1", heyGenAvatarProjectPlacement: avatarPlacement }, { elevenlabs: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_heygen_key", severity: "blocking" }],
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1", heyGenAvatarProjectPlacement: avatarPlacement }, { heygen: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_elevenlabs_key", severity: "blocking" }],
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1", heyGenAvatarProjectPlacement: avatarPlacement }, { elevenlabs: true, heygen: true })
    ).resolves.toMatchObject({
      ok: true,
      summary: {
        requiredProviderKeys: ["elevenlabs", "heygen"],
      },
    });
  });

  test("requires configured HeyGen avatar id and placement for avatar tours", async () => {
    const repository = createRepository({
      ...baseProject,
      project: { ...baseProject.project, tourType: "tour_video_avatar" },
    });

    await expect(
      runPreflight(repository, {}, { elevenlabs: true, heygen: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        { code: "missing_heygen_avatar_id", severity: "blocking" },
        { code: "missing_heygen_avatar_placement", severity: "blocking" },
      ],
    });

    await expect(
      runPreflight(repository, { heyGenAvatarId: "avatar-1" }, { elevenlabs: true, heygen: true })
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "missing_heygen_avatar_placement", severity: "blocking" }],
    });
  });

  test("allows provider image-to-video when the project is otherwise renderable", async () => {
    const repository = createRepository();

    await expect(
      runPreflight(repository, { renderMode: "provider_image_to_video" })
    ).resolves.toEqual({
      ok: true,
      summary: expect.objectContaining({
        renderMode: "provider_image_to_video",
      }),
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

  test("checks provider-facing signed media URL when a provider Supabase origin is configured", async () => {
    const previous = process.env.PROVIDER_VISIBLE_SUPABASE_URL;
    process.env.PROVIDER_VISIBLE_SUPABASE_URL = "https://provider.example.test";
    const repository = createRepository();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 206 }));

    await expect(
      preflightTourRender(
        {
          projectId: "project-1",
          userId: "user-1",
          options: {},
        },
        {
          repository,
          fetcher,
          getProviderKeyStatusMap: vi.fn().mockResolvedValue({}),
        }
      )
    ).resolves.toMatchObject({ ok: true });

    expect(repository.createSignedSourcePhotoUrls).toHaveBeenCalledWith({
      storagePaths: ["user-1/project-1/kitchen.jpg"],
      expiresInSeconds: 60,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://provider.example.test/storage/v1/object/sign/kitchen.jpg",
      expect.objectContaining({
        headers: { Range: "bytes=0-0" },
      })
    );
    if (previous === undefined) {
      delete process.env.PROVIDER_VISIBLE_SUPABASE_URL;
    } else {
      process.env.PROVIDER_VISIBLE_SUPABASE_URL = previous;
    }
  });

  test("blocks when provider-facing signed media URL is unreachable", async () => {
    const previous = process.env.PROVIDER_VISIBLE_SUPABASE_URL;
    process.env.PROVIDER_VISIBLE_SUPABASE_URL = "https://provider.example.test";
    const repository = createRepository();

    await expect(
      preflightTourRender(
        {
          projectId: "project-1",
          userId: "user-1",
          options: {},
        },
        {
          repository,
          fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
          getProviderKeyStatusMap: vi.fn().mockResolvedValue({}),
        }
      )
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "provider_media_unreachable", severity: "blocking" }],
    });
    if (previous === undefined) {
      delete process.env.PROVIDER_VISIBLE_SUPABASE_URL;
    } else {
      process.env.PROVIDER_VISIBLE_SUPABASE_URL = previous;
    }
  });
});
