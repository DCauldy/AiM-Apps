import { vi } from "vitest";

import type {
  RenderableTourProject,
  RenderableTourSceneSourcePhoto,
  TourRenderAsset,
  TourRenderRepository,
  TourRenderRun,
} from "./tour-render.repository";

export const baseRun: TourRenderRun = {
  id: "run-1",
  projectId: "project-1",
  userId: "user-1",
  triggerRunId: "trigger-run-1",
  status: "queued",
  currentStep: "queued",
  currentStepLabel: "Queued",
  progressPercent: 0,
  sceneClipCompletedCount: 0,
  sceneClipTotalCount: 2,
  options: {},
  errorMessage: null,
  resultAssetId: null,
  startedAt: null,
  completedAt: null,
  heartbeatAt: "2026-06-13T12:00:00.000Z",
  createdAt: "2026-06-13T12:00:00.000Z",
  updatedAt: "2026-06-13T12:00:00.000Z",
};

const baseKitchenPhoto: RenderableTourSceneSourcePhoto = {
  id: "photo-1",
  storagePath: "user-1/project-1/kitchen.jpg",
  fileName: "kitchen.jpg",
  contentType: "image/jpeg",
  byteSize: 123,
  width: 1200,
  height: 800,
  priority: 0,
};

export const baseProject: RenderableTourProject = {
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
      authoritativePhoto: baseKitchenPhoto,
      sourcePhotos: [baseKitchenPhoto],
      proofedFacts: [
        {
          id: "fact-1",
          text: "Quartz counters",
          sortOrder: 1,
          sourcePhotoId: "photo-1",
        },
      ],
    },
  ],
};

export const scriptPlanAsset: TourRenderAsset = {
  id: "asset-1",
  createdByRunId: "run-1",
  projectId: "project-1",
  sceneId: null,
  kind: "script_plan",
  storageBucket: "tours-generated-media",
  storagePath: "user-1/project-1/run-1/script-plan.json",
  contentType: "application/json",
  fingerprintHash: "fingerprint-1",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

export const voiceoverAudioAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-audio",
  kind: "voiceover_audio",
  storagePath: "user-1/project-1/run-1/voiceover.mp3",
  contentType: "audio/mpeg",
};

export const voiceoverTranscriptAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-transcript",
  kind: "voiceover_transcript",
  storagePath: "user-1/project-1/run-1/voiceover-transcript.json",
  contentType: "application/json",
};

export const sceneClipAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-scene-clip",
  sceneId: "scene-1",
  kind: "scene_clip",
  storagePath: "user-1/project-1/run-1/scene-clip.mp4",
  contentType: "video/mp4",
  fingerprintHash: "scene-clip-fingerprint",
};

export const joinedScenesAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-joined-scenes",
  kind: "joined_scenes",
  storagePath: "user-1/project-1/run-1/joined-scenes.mp4",
  contentType: "video/mp4",
  fingerprintHash: "joined-scenes-fingerprint",
};

export const finalVideoAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-final-video",
  kind: "final_video",
  storagePath: "user-1/project-1/run-1/final-video.mp4",
  contentType: "video/mp4",
  fingerprintHash: "final-video-fingerprint",
};

export const avatarVideoAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-avatar-video",
  kind: "avatar_video",
  storagePath: "user-1/project-1/run-1/avatar.webm",
  contentType: "video/webm",
  fingerprintHash: "avatar-video-fingerprint",
};

export const avatarMetadataAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-avatar-metadata",
  kind: "avatar_metadata",
  storagePath: "user-1/project-1/run-1/avatar-metadata.json",
  contentType: "application/json",
  fingerprintHash: "avatar-metadata-fingerprint",
};

function runWith(overrides: Partial<TourRenderRun>): TourRenderRun {
  return {
    ...baseRun,
    ...overrides,
  };
}

export function createRepository(
  overrides: Partial<TourRenderRepository> = {}
): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn().mockResolvedValue(baseProject),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
      {
        storagePath: "user-1/project-1/kitchen.jpg",
        signedUrl: "https://signed.example/kitchen.jpg",
      },
    ]),
    downloadListingMedia: vi.fn().mockResolvedValue(Buffer.from("jpg-bytes")),
    uploadRenderAssetJson: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/script-plan.json",
      contentType: "application/json",
    }),
    uploadRenderAssetBytes: vi.fn((input) =>
      Promise.resolve({
        storageBucket: "tours-generated-media",
        storagePath: `user-1/project-1/run-1/${input.kind}.${input.extension}`,
        contentType: input.contentType,
      })
    ),
    downloadRenderAssetJson: vi.fn().mockResolvedValue({
      fullScript: "Welcome to the kitchen.",
      sceneTimings: [
        {
          sceneId: "scene-1",
          scriptText: "Welcome to the kitchen.",
          durationSeconds: 5,
        },
      ],
      model: "test-model",
    }),
    downloadRenderAssetBytes: vi.fn((input) =>
      Promise.resolve(Buffer.from(input.storagePath.includes("voiceover") ? "mp3" : "mp4"))
    ),
    createSignedGeneratedMediaUrl: vi.fn(),
    getAsset: vi.fn(),
    getRenderRun: vi.fn().mockResolvedValue(baseRun),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn((input) =>
      Promise.resolve(
        runWith({
          status: "running",
          currentStep: input.step,
          currentStepLabel: input.label,
          progressPercent: input.progressPercent,
          sceneClipCompletedCount:
            input.sceneClipCompletedCount ?? baseRun.sceneClipCompletedCount,
          sceneClipTotalCount: input.sceneClipTotalCount ?? baseRun.sceneClipTotalCount,
        })
      )
    ),
    markCompleted: vi.fn(() =>
      Promise.resolve(
        runWith({
          status: "completed",
          currentStep: "completed",
          currentStepLabel: "Completed",
          progressPercent: 100,
        })
      )
    ),
    markFailed: vi.fn((input) =>
      Promise.resolve(
        runWith({
          status: "failed",
          currentStep: input.step,
          currentStepLabel: input.label,
          errorMessage: input.safeMessage,
        })
      )
    ),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn().mockResolvedValue(true),
    createAsset: vi.fn((input) => {
      const byKind: Partial<Record<TourRenderAsset["kind"], TourRenderAsset>> = {
        script_plan: scriptPlanAsset,
        voiceover_audio: voiceoverAudioAsset,
        voiceover_transcript: voiceoverTranscriptAsset,
        scene_clip: sceneClipAsset,
        joined_scenes: joinedScenesAsset,
        final_video: finalVideoAsset,
      };
      return Promise.resolve(byKind[input.kind as TourRenderAsset["kind"]] ?? scriptPlanAsset);
    }),
    recordRunAssetUsage: vi.fn(),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}
