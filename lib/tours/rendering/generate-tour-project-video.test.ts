import { writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateTourProjectVideo } from "./generate-tour-project-video";
import type { HeyGenAvatarProvider } from "./tour-avatar";
import type { FinalVideoRenderer } from "./tour-final-render";
import type {
  RenderableTourProject,
  TourRenderAsset,
  TourRenderRepository,
  TourRenderRun,
} from "./tour-render.repository";
import type { SceneClipRenderer } from "./tour-scene-clips";
import type { TourAvatarBatchResult, TourMediaBatchRunner } from "./generate-tour-project-video";
import type { TourScriptPlanningProvider } from "./tour-script-planning";
import type { TransitionDetectionProvider } from "./tour-transitions";
import type { VoiceoverProvider } from "./tour-voiceover";

const baseRun: TourRenderRun = {
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

const baseProject: RenderableTourProject = {
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
      authoritativePhoto: {
        id: "photo-1",
        storagePath: "user-1/project-1/kitchen.jpg",
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        width: 1200,
        height: 800,
      },
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

const scriptPlanAsset: TourRenderAsset = {
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

const voiceoverAudioAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-audio",
  kind: "voiceover_audio",
  storagePath: "user-1/project-1/run-1/voiceover.mp3",
  contentType: "audio/mpeg",
};

const voiceoverTranscriptAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-transcript",
  kind: "voiceover_transcript",
  storagePath: "user-1/project-1/run-1/voiceover-transcript.json",
  contentType: "application/json",
};

const sceneClipAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-scene-clip",
  sceneId: "scene-1",
  kind: "scene_clip",
  storagePath: "user-1/project-1/run-1/scene-clip.mp4",
  contentType: "video/mp4",
  fingerprintHash: "scene-clip-fingerprint",
};

const joinedScenesAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-joined-scenes",
  kind: "joined_scenes",
  storagePath: "user-1/project-1/run-1/joined-scenes.mp4",
  contentType: "video/mp4",
  fingerprintHash: "joined-scenes-fingerprint",
};

const finalVideoAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-final-video",
  kind: "final_video",
  storagePath: "user-1/project-1/run-1/final-video.mp4",
  contentType: "video/mp4",
  fingerprintHash: "final-video-fingerprint",
};

const avatarVideoAsset: TourRenderAsset = {
  ...scriptPlanAsset,
  id: "asset-avatar-video",
  kind: "avatar_video",
  storagePath: "user-1/project-1/run-1/avatar.webm",
  contentType: "video/webm",
  fingerprintHash: "avatar-video-fingerprint",
};

const avatarMetadataAsset: TourRenderAsset = {
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

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
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

describe("generateTourProjectVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs preflight, records stable progress, and completes with a final video asset", async () => {
    const repository = createRepository();
    const scriptPlanningProvider: TourScriptPlanningProvider = {
      planScript: vi.fn().mockResolvedValue({
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
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 2,
        sourcePhotoCount: 2,
        proofedFactCount: 1,
        requiredProviderKeys: [],
      },
    });
    const progress = vi.fn();
    const sceneClipRenderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        await writeFile(input.outputVideoPath, Buffer.from("mp4-bytes"));
        return {};
      }),
    };
    const finalVideoRenderer: FinalVideoRenderer = {
      joinSceneClips: vi.fn(async (input) => {
        await writeFile(input.joinedScenesPath, Buffer.from("joined-mp4"));
        return {};
      }),
      muxFinalVideo: vi.fn(async (input) => {
        await writeFile(input.finalVideoPath, Buffer.from("final-mp4"));
        return {};
      }),
    };

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: true },
        progress,
      },
      { repository, preflight, scriptPlanningProvider, sceneClipRenderer, finalVideoRenderer, resolveProfileId: vi.fn().mockResolvedValue("profile-1") }
    );

    expect(result?.status).toBe("completed");
    expect(preflight).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        userId: "user-1",
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: true },
      },
      { repository }
    );
    expect(repository.updateProgress).toHaveBeenCalledTimes(9);
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: "run-1",
        step: "preparing_assets",
        progressPercent: 10,
      })
    );
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        step: "planning_script",
        progressPercent: 35,
      })
    );
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      8,
      expect.objectContaining({
        step: "joining_video",
        progressPercent: 86,
      })
    );
    expect(repository.updateProgress).toHaveBeenNthCalledWith(
      9,
      expect.objectContaining({
        step: "uploading_final",
        progressPercent: 96,
      })
    );
    expect(scriptPlanningProvider.planScript).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [
          expect.objectContaining({
            id: "scene-1",
            imageUrl: "https://signed.example/kitchen.jpg",
            proofedFacts: [expect.objectContaining({ text: "Quartz counters" })],
          }),
        ],
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "script_plan",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/script-plan.json",
        reusable: true,
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "scene_clip",
        sceneId: "scene-1",
        storageBucket: "tours-generated-media",
        reusable: true,
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "joined_scenes",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/joined_scenes.mp4",
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "final_video",
        storageBucket: "tours-generated-media",
        storagePath: "user-1/project-1/run-1/final_video.mp4",
      })
    );
    expect(repository.markCompleted).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      resultAssetId: "asset-final-video",
    });
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "completed",
        status: "completed",
        safeMessage: "Tour render completed.",
      })
    );
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        step: "completed",
        message: "Tour render completed.",
      })
    );
  });

  it("logs final scene camera motions after resolving auto selections", async () => {
    const autoProject: RenderableTourProject = {
      ...baseProject,
      scenes: [
        {
          ...baseProject.scenes[0],
          cameraMotion: "auto",
        },
      ],
    };
    const repository = createRepository({
      getRenderableTourProject: vi.fn().mockResolvedValue(autoProject),
    });
    const scriptPlanningProvider: TourScriptPlanningProvider = {
      planScript: vi.fn().mockResolvedValue({
        fullScript: "Welcome to the kitchen.",
        sceneTimings: [
          {
            sceneId: "scene-1",
            scriptText: "Welcome to the kitchen.",
            selectedCameraMotion: "detail_glide",
            durationSeconds: 5,
          },
        ],
        model: "test-model",
      }),
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 1,
        requiredProviderKeys: [],
      },
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const sceneClipRenderer: SceneClipRenderer = {
      renderSceneClip: vi.fn(async (input) => {
        await writeFile(input.outputVideoPath, Buffer.from("mp4-bytes"));
        return {};
      }),
    };
    const finalVideoRenderer: FinalVideoRenderer = {
      joinSceneClips: vi.fn(async (input) => {
        await writeFile(input.joinedScenesPath, Buffer.from("joined-mp4"));
        return {};
      }),
      muxFinalVideo: vi.fn(async (input) => {
        await writeFile(input.finalVideoPath, Buffer.from("final-mp4"));
        return {};
      }),
    };

    await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: { renderMode: "ken_burns_ffmpeg", reuseExistingAssets: false },
      },
      { repository, preflight, scriptPlanningProvider, sceneClipRenderer, finalVideoRenderer }
    );

    expect(sceneClipRenderer.renderSceneClip).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: expect.objectContaining({ id: "scene-1", cameraMotion: "detail_glide" }),
      })
    );
    expect(consoleLog).toHaveBeenCalledWith(
      "Tour render scene camera motions resolved.",
      expect.objectContaining({
        projectId: "project-1",
        runId: "run-1",
        sceneCameraMotions: [
          expect.objectContaining({
            sceneId: "scene-1",
            cameraMotion: "detail_glide",
          }),
        ],
      })
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "rendering_scene_clips",
        metadata: expect.objectContaining({
          sceneCameraMotions: [
            expect.objectContaining({
              sceneId: "scene-1",
              cameraMotion: "detail_glide",
            }),
          ],
        }),
      })
    );

    consoleLog.mockRestore();
  });

  it("marks the run failed when task preflight finds blocking issues", async () => {
    const repository = createRepository();
    const preflight = vi.fn().mockResolvedValue({
      ok: false,
      issues: [
        {
          code: "generated_media_unwritable",
          message: "Generated media storage is not writable.",
          severity: "blocking",
        },
      ],
    });
    const progress = vi.fn();

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: { renderMode: "ken_burns_ffmpeg" },
        progress,
      },
      { repository, preflight, resolveProfileId: vi.fn().mockResolvedValue("profile-1") }
    );

    expect(result?.status).toBe("failed");
    expect(repository.updateProgress).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      step: "failed",
      label: "Failed",
      safeMessage: "Generated media storage is not writable.",
    });
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        status: "failed",
        safeMessage: "Generated media storage is not writable.",
      })
    );
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        message: "Generated media storage is not writable.",
      })
    );
  });

  it("marks the run failed with a safe message when orchestration throws", async () => {
    const repository = createRepository({
      updateProgress: vi.fn().mockRejectedValue(new Error("Provider secret should not be exposed")),
    });
    const preflight = vi.fn().mockResolvedValue({
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

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
      },
      { repository, preflight, resolveProfileId: vi.fn().mockResolvedValue("profile-1") }
    );

    expect(result?.status).toBe("failed");
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        safeMessage: "Tour render failed before rendering could complete.",
      })
    );
  });

  it("fails avatar renders before HeyGen when voiceover audio is not provider-reachable", async () => {
    const repository = createRepository({
      getRenderableTourProject: vi.fn().mockResolvedValue({
        ...baseProject,
        project: {
          ...baseProject.project,
          tourType: "tour_video_avatar",
        },
      }),
      createSignedGeneratedMediaUrl: vi.fn().mockResolvedValue({
        storageBucket: "tours-generated-media",
        storagePath: voiceoverAudioAsset.storagePath,
        signedUrl: "http://127.0.0.1:54321/storage/v1/object/sign/tours-generated-media/user-1/project-1/run-1/voiceover.mp3?token=local",
      }),
    });
    const scriptPlanningProvider: TourScriptPlanningProvider = {
      planScript: vi.fn().mockResolvedValue({
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
    };
    const voiceoverProvider: VoiceoverProvider = {
      generateVoiceover: vi.fn(async (input) => {
        await writeFile(input.outputAudioPath, Buffer.from("mp3-bytes"));
        return {
          audioFilePath: input.outputAudioPath,
          transcript: [
            { text: "Welcome to the kitchen.", offsets: { from: 0, to: 1500 } },
          ],
        };
      }),
    };
    const transitionDetectionProvider: TransitionDetectionProvider = {
      detectTransitions: vi.fn().mockResolvedValue({
        transitions: [{ sceneId: "scene-1", chunkId: 0 }],
      }),
    };
    const avatarProvider: HeyGenAvatarProvider = {
      createAvatarVideo: vi.fn(),
      getAvatarVideo: vi.fn(),
      downloadAvatarVideo: vi.fn(),
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video_avatar",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 1,
        requiredProviderKeys: ["elevenlabs", "heygen"],
      },
    });

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: {
          renderMode: "ken_burns_ffmpeg",
          reuseExistingAssets: false,
          elevenLabsVoiceId: "voice-1",
          heyGenAvatarId: "avatar-1",
        },
      },
      {
        repository,
        preflight,
        scriptPlanningProvider,
        voiceoverProvider,
        transitionDetectionProvider,
        avatarProvider,
        getApiKey: vi.fn().mockResolvedValue("provider-key"),
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
      }
    );

    expect(result?.status).toBe("failed");
    expect(avatarProvider.createAvatarVideo).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        safeMessage:
          "Voiceover audio is not reachable by HeyGen. Set PROVIDER_VISIBLE_SUPABASE_URL for local avatar renders.",
      })
    );
  });

  it("includes avatar generation in the media batch with scene clips when available", async () => {
    const repository = createRepository({
      getRenderableTourProject: vi.fn().mockResolvedValue({
        ...baseProject,
        project: {
          ...baseProject.project,
          tourType: "tour_video_avatar",
        },
      }),
      createSignedGeneratedMediaUrl: vi.fn().mockResolvedValue({
        storageBucket: "tours-generated-media",
        storagePath: voiceoverAudioAsset.storagePath,
        signedUrl: "https://providers.example/voiceover.mp3",
      }),
    });
    const scriptPlanningProvider: TourScriptPlanningProvider = {
      planScript: vi.fn().mockResolvedValue({
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
    };
    const voiceoverProvider: VoiceoverProvider = {
      generateVoiceover: vi.fn(async (input) => {
        await writeFile(input.outputAudioPath, Buffer.from("mp3-bytes"));
        return {
          audioFilePath: input.outputAudioPath,
          transcript: [
            { text: "Welcome to the kitchen.", offsets: { from: 0, to: 1500 } },
          ],
        };
      }),
    };
    const transitionDetectionProvider: TransitionDetectionProvider = {
      detectTransitions: vi.fn().mockResolvedValue({
        transitions: [{ sceneId: "scene-1", chunkId: 0 }],
      }),
    };
    const mediaBatchRunner: TourMediaBatchRunner = vi.fn(
      async ({ sceneClipItems, avatarItem }: Parameters<TourMediaBatchRunner>[0]) => {
        const avatar: TourAvatarBatchResult | null = avatarItem
          ? {
              reused: false as const,
              avatarAsset: avatarVideoAsset,
              metadataAsset: avatarMetadataAsset,
              metadata: {
                analysis: {
                  sourceWidth: 720,
                  sourceHeight: 1280,
                  sampledFrameCount: 1,
                  alphaThreshold: 8,
                  medianBox: { x: 0, y: 0, width: 720, height: 1280, right: 720, bottom: 1280 },
                  maxBox: { x: 0, y: 0, width: 720, height: 1280, right: 720, bottom: 1280 },
                  transparentPadding: { left: 0, right: 0, top: 0, bottom: 0 },
                  edgeTouchRate: { left: 0, right: 0, top: 0, bottom: 0 },
                  cropRisk: { level: "none", reasons: [] },
                },
                overlay: {
                  canvas: { width: 1080, height: 1920 },
                  size: "medium",
                  placement: {
                    avatarWidth: 500,
                    anchor: "bottom-right",
                    rightMargin: 0,
                    bottomMargin: 0,
                    basis: "videoLayer",
                    overlayX: "W-w",
                    overlayY: "H-h",
                  },
                  ffmpeg: {
                    avatarInputCodec: "libvpx-vp9",
                    backgroundFilter: "[0:v]format=rgba[bg]",
                    avatarScaleFilter: "scale=500:-1",
                    overlayFilter: "[bg][av]overlay=x=W-w:y=H-h:format=auto[v]",
                    filterComplex: "[0:v]format=rgba[bg];[1:v]scale=500:-1[av];[bg][av]overlay=x=W-w:y=H-h:format=auto[v]",
                    outputVideoCodec: "libx264",
                    outputAudioCodec: "aac",
                    preserveAlpha: true,
                  },
                },
                frameChecks: [],
                warnings: [],
              },
              fingerprintHash: "avatar-fingerprint",
              fingerprint: {} as never,
            }
          : null;

        return {
          sceneClips: sceneClipItems.map((item) => ({
            index: item.index,
            clip: {
              sceneId: item.scene.id,
              durationSeconds: item.duration.durationSeconds,
              asset: sceneClipAsset,
              reused: false,
              fingerprintHash: "scene-clip-fingerprint",
              fingerprint: {} as never,
            },
          })),
          avatar,
        };
      }
    );
    const finalVideoRenderer: FinalVideoRenderer = {
      joinSceneClips: vi.fn(async (input) => {
        await writeFile(input.joinedScenesPath, Buffer.from("joined-mp4"));
        return {};
      }),
      muxFinalVideo: vi.fn(async (input) => {
        expect(input.avatarVideoPath).toBeTruthy();
        expect(input.avatarOverlay).toBeTruthy();
        await writeFile(input.finalVideoPath, Buffer.from("final-mp4"));
        return {};
      }),
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video_avatar",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 1,
        sourcePhotoCount: 1,
        proofedFactCount: 1,
        requiredProviderKeys: ["elevenlabs", "heygen"],
      },
    });

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: {
          renderMode: "ken_burns_ffmpeg",
          reuseExistingAssets: false,
          elevenLabsVoiceId: "voice-1",
          heyGenAvatarId: "avatar-1",
        },
      },
      {
        repository,
        preflight,
        scriptPlanningProvider,
        voiceoverProvider,
        transitionDetectionProvider,
        mediaBatchRunner,
        finalVideoRenderer,
        getApiKey: vi.fn().mockResolvedValue("provider-key"),
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
      }
    );

    expect(result?.status).toBe("completed");
    expect(mediaBatchRunner).toHaveBeenCalledWith({
      sceneClipItems: [
        expect.objectContaining({
          index: 0,
          scene: expect.objectContaining({ id: "scene-1" }),
        }),
      ],
      avatarItem: expect.objectContaining({
        projectId: "project-1",
        runId: "run-1",
        userId: "user-1",
        profileId: "profile-1",
        projectName: "Demo Listing",
        signedVoiceoverAudioUrl: "https://providers.example/voiceover.mp3",
        voiceoverAudioAsset,
        options: expect.objectContaining({ avatarId: "avatar-1", reuseExistingAssets: false }),
      }),
    });
    expect(finalVideoRenderer.muxFinalVideo).toHaveBeenCalled();
  });

  it("marks the run failed with a safe message when transition detection is invalid", async () => {
    const projectWithVoiceover: RenderableTourProject = {
      ...baseProject,
      project: {
        ...baseProject.project,
        tourType: "tour_video_voice_over",
      },
      scenes: [
        baseProject.scenes[0],
        {
          ...baseProject.scenes[0],
          id: "scene-2",
          title: "Patio",
          sortOrder: 2,
          authoritativePhoto: {
            ...baseProject.scenes[0].authoritativePhoto,
            id: "photo-2",
            storagePath: "user-1/project-1/patio.jpg",
            fileName: "patio.jpg",
          },
          proofedFacts: [
            {
              id: "fact-2",
              text: "Covered outdoor dining",
              sortOrder: 1,
              sourcePhotoId: "photo-2",
            },
          ],
        },
      ],
    };
    const repository = createRepository({
      getRenderableTourProject: vi.fn().mockResolvedValue(projectWithVoiceover),
      createSignedSourcePhotoUrls: vi.fn().mockResolvedValue([
        {
          storagePath: "user-1/project-1/kitchen.jpg",
          signedUrl: "https://signed.example/kitchen.jpg",
        },
        {
          storagePath: "user-1/project-1/patio.jpg",
          signedUrl: "https://signed.example/patio.jpg",
        },
      ]),
      createAsset: vi
        .fn()
        .mockResolvedValueOnce(scriptPlanAsset)
        .mockResolvedValueOnce(voiceoverAudioAsset)
        .mockResolvedValueOnce(voiceoverTranscriptAsset),
    });
    const scriptPlanningProvider: TourScriptPlanningProvider = {
      planScript: vi.fn().mockResolvedValue({
        fullScript: "Welcome to the kitchen. Outside is the patio.",
        sceneTimings: [
          {
            sceneId: "scene-1",
            scriptText: "Welcome to the kitchen.",
            durationSeconds: 3,
          },
          {
            sceneId: "scene-2",
            scriptText: "Outside is the patio.",
            durationSeconds: 3,
          },
        ],
        model: "test-model",
      }),
    };
    const voiceoverProvider: VoiceoverProvider = {
      generateVoiceover: vi.fn(async (input) => {
        await writeFile(input.outputAudioPath, Buffer.from("mp3-bytes"));
        return {
          audioFilePath: input.outputAudioPath,
          transcript: [
            { text: "Welcome to the kitchen.", offsets: { from: 0, to: 1500 } },
            { text: "Outside is the patio.", offsets: { from: 1500, to: 3200 } },
          ],
        };
      }),
    };
    const transitionDetectionProvider: TransitionDetectionProvider = {
      detectTransitions: vi.fn().mockResolvedValue("{not-json"),
    };
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      summary: {
        projectId: "project-1",
        tourType: "tour_video_voice_over",
        renderMode: "ken_burns_ffmpeg",
        includedSceneCount: 2,
        sourcePhotoCount: 2,
        proofedFactCount: 2,
        requiredProviderKeys: ["elevenlabs"],
      },
    });

    const result = await generateTourProjectVideo(
      {
        projectId: "project-1",
        userId: "user-1",
        renderRunId: "run-1",
        options: {
          renderMode: "ken_burns_ffmpeg",
          reuseExistingAssets: false,
          elevenLabsVoiceId: "voice-1",
        },
      },
      {
        repository,
        preflight,
        scriptPlanningProvider,
        voiceoverProvider,
        transitionDetectionProvider,
        getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
      }
    );

    expect(result?.status).toBe("failed");
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "failed",
        safeMessage: "Scene transition detection returned an invalid response.",
      })
    );
  });
});
