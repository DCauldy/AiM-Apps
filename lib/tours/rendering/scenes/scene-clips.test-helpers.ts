import { writeFile } from "node:fs/promises";
import { vi } from "vitest";

import type {
  ProviderSceneClipNormalizer,
} from "./scene-clips";
import type { RenderableTourProject, TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";
import type { SceneTiming } from "../transitions/scene-boundaries";

export const primarySourcePhoto = {
  id: "photo-1",
  storagePath: "user-1/project-1/kitchen.jpg",
  fileName: "kitchen.jpg",
  contentType: "image/jpeg" as const,
  byteSize: 123,
  width: 1200,
  height: 800,
  priority: 0,
};

export const project: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Demo Listing",
    propertyAddress: "123 Main St",
    listingUrl: null,
    tourType: "tour_video",
  },
  scenes: [
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: primarySourcePhoto,
      sourcePhotos: [primarySourcePhoto],
      proofedFacts: [],
    },
  ],
};

export const durations: SceneTiming[] = [
  {
    sceneId: "scene-1",
    title: "Kitchen",
    durationSeconds: 4,
    offsets: { from: 0, to: 4000 },
  },
];

export const multiSceneProject: RenderableTourProject = {
  ...project,
  scenes: [
    project.scenes[0]!,
    {
      ...project.scenes[0]!,
      id: "scene-2",
      title: "Patio",
      sortOrder: 2,
      authoritativePhoto: {
        ...project.scenes[0]!.authoritativePhoto,
        id: "photo-2",
        storagePath: "user-1/project-1/patio.jpg",
        fileName: "patio.jpg",
      },
      sourcePhotos: [
        {
          ...project.scenes[0]!.authoritativePhoto,
          id: "photo-2",
          storagePath: "user-1/project-1/patio.jpg",
          fileName: "patio.jpg",
        },
      ],
    },
    {
      ...project.scenes[0]!,
      id: "scene-3",
      title: "Bedroom",
      sortOrder: 3,
      authoritativePhoto: {
        ...project.scenes[0]!.authoritativePhoto,
        id: "photo-3",
        storagePath: "user-1/project-1/bedroom.jpg",
        fileName: "bedroom.jpg",
      },
      sourcePhotos: [
        {
          ...project.scenes[0]!.authoritativePhoto,
          id: "photo-3",
          storagePath: "user-1/project-1/bedroom.jpg",
          fileName: "bedroom.jpg",
        },
      ],
    },
  ],
};

export const multiSceneTimings: SceneTiming[] = [
  durations[0]!,
  {
    sceneId: "scene-2",
    title: "Patio",
    durationSeconds: 5,
    offsets: { from: 4000, to: 9000 },
  },
  {
    sceneId: "scene-3",
    title: "Bedroom",
    durationSeconds: 6,
    offsets: { from: 9000, to: 15000 },
  },
];

export const sceneClipAsset: TourRenderAsset = {
  id: "asset-clip",
  createdByRunId: "run-1",
  projectId: "project-1",
  sceneId: "scene-1",
  kind: "scene_clip",
  storageBucket: "tours-generated-media",
  storagePath: "user-1/project-1/run-1/scene-clip.mp4",
  contentType: "video/mp4",
  fingerprintHash: "hash",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

export function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn(),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
      {
        storagePath: "user-1/project-1/kitchen.jpg",
        signedUrl: "https://signed.example/kitchen.jpg",
      },
    ]),
    downloadListingMedia: vi.fn().mockResolvedValue(Buffer.from("jpg-bytes")),
    uploadRenderAssetJson: vi.fn(),
    uploadRenderAssetBytes: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/scene-clip.mp4",
      contentType: "video/mp4",
    }),
    downloadRenderAssetJson: vi.fn(),
    getRenderRun: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    listActiveProjectRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markCancelled: vi.fn(),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn(),
    createAsset: vi.fn().mockResolvedValue(sceneClipAsset),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

export function createProviderNormalizer(): ProviderSceneClipNormalizer {
  return {
    normalizeSceneClip: vi.fn(async (input) => {
      await writeFile(input.outputVideoPath, Buffer.from("normalized-provider-mp4"));
      return { metadata: { normalizer: "test-normalizer" } };
    }),
  };
}
