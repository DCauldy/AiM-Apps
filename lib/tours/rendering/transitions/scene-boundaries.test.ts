import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildTranscriptChunks,
  createOpenRouterSceneBoundaryDetectionProvider,
  deriveSceneTimings,
  detectSceneBoundariesAndTimingsStage,
  normalizeSceneBoundaries,
  type SceneBoundaryDetectionProvider,
} from "./scene-boundaries";
import type {
  RenderableTourProject,
  RenderableTourSceneSourcePhoto,
  TourRenderAsset,
  TourRenderRepository,
} from "../repositories/tour-render.repository";

function sourcePhoto(input: {
  id: string;
  storagePath: string;
  fileName: string;
  byteSize: number;
}): RenderableTourSceneSourcePhoto {
  return {
    ...input,
    contentType: "image/jpeg",
    width: 1200,
    height: 800,
    priority: 0,
  };
}

const kitchenPhoto = sourcePhoto({
  id: "photo-1",
  storagePath: "user-1/project-1/kitchen.jpg",
  fileName: "kitchen.jpg",
  byteSize: 123,
});
const patioPhoto = sourcePhoto({
  id: "photo-2",
  storagePath: "user-1/project-1/patio.jpg",
  fileName: "patio.jpg",
  byteSize: 456,
});

const project: RenderableTourProject = {
  project: {
    id: "project-1",
    userId: "user-1",
    name: "Demo Listing",
    propertyAddress: "123 Main St",
    listingUrl: null,
    tourType: "tour_video_voice_over",
  },
  scenes: [
    {
      id: "scene-1",
      title: "Kitchen",
      sortOrder: 1,
      included: true,
      cameraMotion: "slow_push",
      authoritativePhoto: kitchenPhoto,
      sourcePhotos: [kitchenPhoto],
      proofedFacts: [
        {
          id: "fact-1",
          text: "Quartz counters",
          sortOrder: 1,
          sourcePhotoId: "photo-1",
        },
      ],
    },
    {
      id: "scene-2",
      title: "Patio",
      sortOrder: 2,
      included: true,
      cameraMotion: "slow_pan",
      authoritativePhoto: patioPhoto,
      sourcePhotos: [patioPhoto],
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

const transcript = [
  { text: "Welcome to the kitchen.", offsets: { from: 0, to: 1200 } },
  { text: "The quartz counters anchor the room.", offsets: { from: 1200, to: 2600 } },
  { text: "Outside, the covered patio is ready for dinner.", offsets: { from: 2600, to: 5200 } },
];

const baseAsset: TourRenderAsset = {
  id: "asset-base",
  createdByRunId: "old-run",
  projectId: "project-1",
  sceneId: null,
  kind: "scene_transitions",
  storageBucket: "tours-generated-media",
  storagePath: "old/asset.json",
  contentType: "application/json",
  fingerprintHash: "hash",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

const transitionsAsset: TourRenderAsset = {
  ...baseAsset,
  id: "asset-transitions",
  kind: "scene_transitions",
  storagePath: "new/scene-transitions.json",
};

const durationsAsset: TourRenderAsset = {
  ...baseAsset,
  id: "asset-durations",
  kind: "scene_durations",
  storagePath: "new/scene-durations.json",
};

function scenes() {
  return project.scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    sortOrder: scene.sortOrder,
    proofedFacts: scene.proofedFacts,
  }));
}

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn(),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn(),
    uploadRenderAssetJson: vi.fn((input) =>
      Promise.resolve({
        storageBucket: "tours-generated-media",
        storagePath: `new/${input.kind}.json`,
        contentType: "application/json",
      })
    ),
    uploadRenderAssetBytes: vi.fn(),
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
    createAsset: vi.fn((input) =>
      Promise.resolve(
        input.kind === "scene_transitions" ? transitionsAsset : durationsAsset
      )
    ),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

function createProvider(output: unknown): SceneBoundaryDetectionProvider {
  return {
    detectSceneBoundaries: vi.fn().mockResolvedValue(output),
  };
}

describe("tour transition detection", () => {
  it("validates provider transitions, derives durations, fingerprints inputs, and persists assets", async () => {
    const repository = createRepository();
    const provider = createProvider({
      transitions: [
        { sceneId: "scene-1", chunkId: 0, text: "Welcome" },
        { sceneId: "scene-2", chunkId: 2, text: "Outside" },
      ],
    });

    const result = await detectSceneBoundariesAndTimingsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      transcript,
      provider,
      options: {
        modelId: "openrouter/transition-model",
        minDurationSeconds: 0.5,
        roundingIncrementSeconds: 0.1,
      },
    });

    expect(result.reused).toBe(false);
    expect(result.durations).toEqual([
      {
        sceneId: "scene-1",
        title: "Kitchen",
        durationSeconds: 2.6,
        offsets: { from: 0, to: 2600 },
      },
      {
        sceneId: "scene-2",
        title: "Patio",
        durationSeconds: 2.6,
        offsets: { from: 2600, to: 5200 },
      },
    ]);
    expect(provider.detectSceneBoundaries).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "openrouter/transition-model",
        transcriptChunks: [
          { id: 0, text: "Welcome to the kitchen.", offsets: { from: 0, to: 1200 } },
          {
            id: 1,
            text: "The quartz counters anchor the room.",
            offsets: { from: 1200, to: 2600 },
          },
          {
            id: 2,
            text: "Outside, the covered patio is ready for dinner.",
            offsets: { from: 2600, to: 5200 },
          },
        ],
        scenes: [
          expect.objectContaining({
            id: "scene-1",
            proofedFacts: [expect.objectContaining({ text: "Quartz counters" })],
          }),
          expect.objectContaining({
            id: "scene-2",
            proofedFacts: [expect.objectContaining({ text: "Covered outdoor dining" })],
          }),
        ],
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "scene_transitions",
        fingerprint: expect.objectContaining({
          transcriptChunks: expect.any(Array),
          scenes: expect.any(Array),
          modelId: "openrouter/transition-model",
          promptVersion: "tour-transition-detection-v1",
        }),
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "scene_durations",
        fingerprint: expect.objectContaining({
          transitionFingerprintHash: result.transitionFingerprintHash,
          durationSettings: {
            minDurationSeconds: 0.5,
            roundingIncrementSeconds: 0.1,
          },
        }),
      })
    );
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-transitions",
      usage: "created",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-durations",
      usage: "created",
    });
  });

  it("rejects invalid provider JSON", () => {
    expect(() =>
      normalizeSceneBoundaries({
        providerOutput: "{not-json",
        scenes: scenes(),
        transcriptChunks: buildTranscriptChunks(transcript),
      })
    ).toThrow(/not valid JSON/);
  });

  it("accepts fenced JSON from the OpenRouter transition provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "```json",
                  "{\"transitions\":[{\"sceneId\":\"scene-1\",\"chunkId\":0},{\"sceneId\":\"scene-2\",\"chunkId\":2}]}",
                  "```",
                ].join("\n"),
              },
            },
          ],
          usage: { total_tokens: 25 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = createOpenRouterSceneBoundaryDetectionProvider({
      apiKey: "openrouter-key",
      fetcher: fetcher as typeof globalThis.fetch,
    });

    await expect(
      provider.detectSceneBoundaries({
        transcriptChunks: buildTranscriptChunks(transcript),
        scenes: scenes(),
        modelId: "openrouter/transition-model",
        promptVersion: "test-prompt",
      })
    ).resolves.toEqual({
      transitions: [
        { sceneId: "scene-1", chunkId: 0 },
        { sceneId: "scene-2", chunkId: 2 },
      ],
      usage: { total_tokens: 25 },
    });
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-OpenRouter-Title")).toBe("AiM Tours");
    expect(headers.get("X-Title")).toBe("AiM Tours");
  });

  it("skips unusable transcript chunks before transition detection", () => {
    expect(
      buildTranscriptChunks([
        { text: "Welcome", offsets: { from: 0, to: 500 } },
        { text: " ", offsets: { from: 500, to: 520 } },
        { text: ".", offsets: { from: 520, to: 520 } },
        { text: "inside", offsets: { from: 520, to: 900 } },
      ])
    ).toEqual([
      { id: 0, text: "Welcome", offsets: { from: 0, to: 500 } },
      { id: 1, text: "inside", offsets: { from: 520, to: 900 } },
    ]);
  });

  it("rejects transcripts with no usable chunks", () => {
    expect(() =>
      buildTranscriptChunks([
        { text: " ", offsets: { from: 0, to: 10 } },
        { text: ".", offsets: { from: 20, to: 20 } },
      ])
    ).toThrow(/did not include any usable chunks/);
  });

  it("rejects missing scene mapping", () => {
    expect(() =>
      normalizeSceneBoundaries({
        providerOutput: {
          transitions: [
            { sceneId: "scene-1", chunkId: 0 },
            { sceneId: "missing-scene", chunkId: 2 },
          ],
        },
        scenes: scenes(),
        transcriptChunks: buildTranscriptChunks(transcript),
      })
    ).toThrow(/expected scene-2/);
  });

  it("anchors the first scene transition to the first transcript chunk", () => {
    expect(
      normalizeSceneBoundaries({
        providerOutput: {
          transitions: [
            { sceneId: "scene-1", chunkId: 1 },
            { sceneId: "scene-2", chunkId: 2 },
          ],
        },
        scenes: scenes(),
        transcriptChunks: buildTranscriptChunks(transcript),
      })
    ).toEqual([
      { sceneId: "scene-1", chunkId: 0, text: undefined },
      { sceneId: "scene-2", chunkId: 2, text: undefined },
    ]);
  });

  it("rejects out-of-order transitions", () => {
    expect(() =>
      normalizeSceneBoundaries({
        providerOutput: {
          transitions: [
            { sceneId: "scene-1", chunkId: 1 },
            { sceneId: "scene-2", chunkId: 0 },
          ],
        },
        scenes: scenes(),
        transcriptChunks: buildTranscriptChunks(transcript),
      })
    ).toThrow(/strictly increasing/);
  });

  it("derives scene durations deterministically from transition boundaries", () => {
    const durations = deriveSceneTimings({
      transitions: [
        { sceneId: "scene-1", chunkId: 0 },
        { sceneId: "scene-2", chunkId: 2 },
      ],
      scenes: scenes(),
      transcriptChunks: buildTranscriptChunks(transcript),
      settings: {
        minDurationSeconds: 0.5,
        roundingIncrementSeconds: 0.25,
      },
    });

    expect(durations).toEqual([
      {
        sceneId: "scene-1",
        title: "Kitchen",
        durationSeconds: 2.5,
        offsets: { from: 0, to: 2600 },
      },
      {
        sceneId: "scene-2",
        title: "Patio",
        durationSeconds: 2.5,
        offsets: { from: 2600, to: 5200 },
      },
    ]);
  });

  it("keeps millisecond-level duration precision by default", () => {
    const durations = deriveSceneTimings({
      transitions: [
        { sceneId: "scene-1", chunkId: 0 },
        { sceneId: "scene-2", chunkId: 2 },
      ],
      scenes: scenes(),
      transcriptChunks: [
        { id: 0, text: "Welcome", offsets: { from: 0, to: 900 } },
        { id: 1, text: "inside", offsets: { from: 900, to: 2587 } },
        { id: 2, text: "outside", offsets: { from: 2587, to: 5123 } },
      ],
    });

    expect(durations).toEqual([
      {
        sceneId: "scene-1",
        title: "Kitchen",
        durationSeconds: 2.587,
        offsets: { from: 0, to: 2587 },
      },
      {
        sceneId: "scene-2",
        title: "Patio",
        durationSeconds: 2.536,
        offsets: { from: 2587, to: 5123 },
      },
    ]);
  });

  it("selects reusable transition and duration assets when fingerprints match", async () => {
    const repository = createRepository({
      findReusableAsset: vi
        .fn()
        .mockResolvedValueOnce(transitionsAsset)
        .mockResolvedValueOnce(durationsAsset),
      downloadRenderAssetJson: vi
        .fn()
        .mockResolvedValueOnce({
          transitions: [
            { sceneId: "scene-1", chunkId: 0 },
            { sceneId: "scene-2", chunkId: 2 },
          ],
        })
        .mockResolvedValueOnce({
          durations: [
            {
              sceneId: "scene-1",
              durationSeconds: 2.6,
              offsets: { from: 0, to: 2600 },
            },
            {
              sceneId: "scene-2",
              durationSeconds: 2.6,
              offsets: { from: 2600, to: 5200 },
            },
          ],
        }),
    });
    const provider = createProvider({ transitions: [] });

    const result = await detectSceneBoundariesAndTimingsStage({
      project,
      repository,
      runId: "run-1",
      userId: "user-1",
      transcript,
      provider,
      options: { modelId: "openrouter/transition-model" },
    });

    expect(result.reused).toBe(true);
    expect(provider.detectSceneBoundaries).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-transitions",
      usage: "reused",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-durations",
      usage: "reused",
    });
  });
});
