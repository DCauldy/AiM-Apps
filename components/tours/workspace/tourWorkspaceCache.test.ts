import { describe, expect, test } from "vitest";
import type { TourSceneModel } from "@/lib/tours/scenes.core";
import type { TourProjectWorkspaceViewModel, TourScene } from "@/lib/tours/workspace";
import {
  applyTourProjectDetails,
  applyTourScenePatch,
  removeTourScenePhoto,
  replaceTourSceneAuthoritativePhoto,
} from "./tourWorkspaceCache";

function photo(id: string, previewUrl: string | null): TourScene["sourcePhotos"][number] {
  return {
    id,
    fileName: `${id}.jpg`,
    storagePath: `user-1/project-1/${id}.jpg`,
    contentType: "image/jpeg",
    previewUrl,
  };
}

function scene(overrides: Partial<TourScene> = {}): TourScene {
  const authoritativePhoto = photo("photo-1", "https://signed.example/photo-1");
  return {
    id: "scene-1",
    title: "Kitchen",
    sortOrder: 0,
    included: true,
    cameraMotion: "auto",
    transitionEffect: "auto",
    authoritativePhoto,
    sourcePhotos: [
      authoritativePhoto,
      photo("photo-2", "https://signed.example/photo-2"),
    ],
    facts: [],
    hasProofedContext: false,
    status: "ready",
    ...overrides,
  };
}

function workspace(overrides: Partial<TourProjectWorkspaceViewModel> = {}): TourProjectWorkspaceViewModel {
  return {
    project: {
      id: "project-1",
      name: "Original project",
      lifecycleStatus: "open",
      tourType: "tour_video",
      elevenLabsVoiceId: null,
      heyGenAvatarId: null,
      heyGenAvatarPlacement: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    listing: {
      address: "123 Main St",
      listingUrl: null,
    },
    ownership: {
      canEdit: true,
    },
    listingMediaAuthorization: {
      acknowledgementCopy: "Copy",
      hasAcknowledged: true,
      acknowledgedAt: "2026-06-01T00:00:00.000Z",
    },
    tourScenes: [scene()],
    readiness: {
      media: "ready",
      scenePlan: "ready",
      approvals: "not_started",
      narration: "not_started",
      export: "not_started",
    },
    ...overrides,
  };
}

function rawScenePatch(overrides: Partial<TourSceneModel> = {}): TourSceneModel {
  return {
    id: "scene-1",
    projectId: "project-1",
    title: "Kitchen update",
    sortOrder: 0,
    included: false,
    cameraMotion: "hero_reveal",
    transitionEffect: "fade",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    authoritativePhoto: {
      id: "photo-1",
      projectId: "project-1",
      sceneId: "scene-1",
      storagePath: "user-1/project-1/photo-1.jpg",
      fileName: "photo-1.jpg",
      contentType: "image/jpeg",
      byteSize: 5,
      width: null,
      height: null,
      priority: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    sourcePhotos: [
      {
        id: "photo-1",
        projectId: "project-1",
        sceneId: "scene-1",
        storagePath: "user-1/project-1/photo-1.jpg",
        fileName: "photo-1.jpg",
        contentType: "image/jpeg",
        byteSize: 5,
        width: null,
        height: null,
        priority: 0,
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("tour workspace cache helpers", () => {
  test("merges raw scene responses without dropping signed preview urls", () => {
    const nextWorkspace = applyTourScenePatch(workspace(), rawScenePatch());
    const [nextScene] = nextWorkspace.tourScenes;

    expect(nextScene?.included).toBe(false);
    expect(nextScene?.status).toBe("skipped");
    expect(nextScene?.cameraMotion).toBe("hero_reveal");
    expect(nextScene?.authoritativePhoto.previewUrl).toBe("https://signed.example/photo-1");
    expect(nextScene?.sourcePhotos[0]?.previewUrl).toBe("https://signed.example/photo-1");
    expect(nextWorkspace.readiness.media).toBe("skipped");
  });

  test("replaces the authoritative photo in both scene locations", () => {
    const replacement = photo("photo-1", "https://signed.example/replacement");
    const nextWorkspace = replaceTourSceneAuthoritativePhoto(
      workspace(),
      "scene-1",
      replacement
    );
    const [nextScene] = nextWorkspace.tourScenes;

    expect(nextScene?.authoritativePhoto.previewUrl).toBe("https://signed.example/replacement");
    expect(nextScene?.sourcePhotos[0]?.previewUrl).toBe("https://signed.example/replacement");
  });

  test("promotes the next local source photo after removing the authoritative photo", () => {
    const nextWorkspace = removeTourScenePhoto(workspace(), "scene-1", "photo-1");
    const [nextScene] = nextWorkspace.tourScenes;

    expect(nextScene?.authoritativePhoto.id).toBe("photo-2");
    expect(nextScene?.authoritativePhoto.previewUrl).toBe("https://signed.example/photo-2");
    expect(nextScene?.sourcePhotos.map((sourcePhoto) => sourcePhoto.id)).toEqual(["photo-2"]);
  });

  test("maps project detail updates into workspace project and listing fields", () => {
    const nextWorkspace = applyTourProjectDetails(workspace(), {
      id: "project-1",
      name: "Updated project",
      property_address: "456 Oak Ave",
      listing_url: "https://example.test/listing",
      tour_type: "tour_video_avatar",
      elevenlabs_voice_id: "voice-1",
      heygen_avatar_id: "avatar-1",
      heygen_avatar_placement: null,
      status: "open",
      updated_at: "2026-06-03T00:00:00.000Z",
    });

    expect(nextWorkspace.project.name).toBe("Updated project");
    expect(nextWorkspace.project.tourType).toBe("tour_video_avatar");
    expect(nextWorkspace.project.elevenLabsVoiceId).toBe("voice-1");
    expect(nextWorkspace.listing.address).toBe("456 Oak Ave");
    expect(nextWorkspace.listing.listingUrl).toBe("https://example.test/listing");
  });
});
