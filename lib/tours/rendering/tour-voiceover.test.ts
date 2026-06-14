import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateVoiceoverStage,
  type VoiceoverProvider,
} from "./tour-voiceover";
import type {
  TourRenderAsset,
  TourRenderRepository,
} from "./tour-render.repository";
import type { TourScriptPlan } from "./tour-script-planning";

const scriptPlan: TourScriptPlan = {
  fullScript: "Welcome to the kitchen. Notice the quartz counters.",
  voicePromptScript: "[bright, confident real estate host] Welcome to the kitchen. Notice the quartz counters.",
  sceneTimings: [
    {
      sceneId: "scene-1",
      spokenText: "Welcome to the kitchen. Notice the quartz counters.",
      voicePromptText: "[bright, confident real estate host] Welcome to the kitchen. Notice the quartz counters.",
      deliveryTags: ["[bright, confident real estate host]"],
      scriptText: "Welcome to the kitchen. Notice the quartz counters.",
      durationSeconds: 5,
    },
  ],
  model: "script-model",
};

const baseAsset: TourRenderAsset = {
  id: "asset-base",
  createdByRunId: "run-old",
  projectId: "project-1",
  sceneId: null,
  kind: "voiceover_audio",
  storageBucket: "tours-generated-media",
  storagePath: "old/asset.mp3",
  contentType: "audio/mpeg",
  fingerprintHash: "hash",
  fingerprint: {},
  reusable: true,
  metadata: {},
  deletedAt: null,
  storageDeletedAt: null,
  deleteReason: null,
  createdAt: "2026-06-13T12:00:00.000Z",
};

const audioAsset: TourRenderAsset = {
  ...baseAsset,
  id: "asset-audio",
  kind: "voiceover_audio",
  storagePath: "new/voiceover.mp3",
  contentType: "audio/mpeg",
};

const transcriptAsset: TourRenderAsset = {
  ...baseAsset,
  id: "asset-transcript",
  kind: "voiceover_transcript",
  storagePath: "new/transcript.json",
  contentType: "application/json",
};

function createRepository(overrides: Partial<TourRenderRepository> = {}): TourRenderRepository {
  return {
    getTourRenderPreflightProject: vi.fn(),
    getRenderableTourProject: vi.fn(),
    canReadListingMedia: vi.fn(),
    canWriteGeneratedMedia: vi.fn(),
    createSignedSourcePhotoUrls: vi.fn(),
    uploadRenderAssetJson: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "new/transcript.json",
      contentType: "application/json",
    }),
    uploadRenderAssetBytes: vi.fn().mockResolvedValue({
      storageBucket: "tours-generated-media",
      storagePath: "new/voiceover.mp3",
      contentType: "audio/mpeg",
    }),
    downloadRenderAssetJson: vi.fn(),
    getRenderRun: vi.fn(),
    listRecentRenderRuns: vi.fn(),
    createRenderRun: vi.fn(),
    attachTriggerRunId: vi.fn(),
    updateProgress: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    recordHeartbeat: vi.fn(),
    appendEvent: vi.fn(),
    createAsset: vi
      .fn()
      .mockResolvedValueOnce(audioAsset)
      .mockResolvedValueOnce(transcriptAsset),
    recordRunAssetUsage: vi.fn().mockResolvedValue(true),
    findReusableAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as TourRenderRepository;
}

function createProvider(overrides: Partial<VoiceoverProvider> = {}): VoiceoverProvider {
  return {
    generateVoiceover: vi.fn(async (input) => {
      await writeFile(input.outputAudioPath, Buffer.from("mp3-bytes"));
      return {
        audioFilePath: input.outputAudioPath,
        transcript: [
          {
            text: "Welcome to the kitchen.",
            offsets: { from: 0, to: 1200 },
          },
        ],
        metadata: { requestId: "req-1" },
      };
    }),
    ...overrides,
  };
}

describe("generateVoiceoverStage", () => {
  it("throws before provider work when the ElevenLabs key is missing", async () => {
    const repository = createRepository();
    const provider = createProvider();

    await expect(
      generateVoiceoverStage({
        projectId: "project-1",
        runId: "run-1",
        userId: "user-1",
        profileId: "profile-1",
        scriptPlan,
        repository,
        provider,
        getApiKey: vi.fn().mockResolvedValue(null),
        options: { voiceId: "voice-1" },
      })
    ).rejects.toMatchObject({ code: "MISSING_ELEVENLABS_API_KEY" });

    expect(provider.generateVoiceover).not.toHaveBeenCalled();
    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("selects reusable audio and transcript assets when both fingerprints match", async () => {
    const repository = createRepository({
      findReusableAsset: vi
        .fn()
        .mockResolvedValueOnce(audioAsset)
        .mockResolvedValueOnce(transcriptAsset),
    });
    const provider = createProvider();

    const result = await generateVoiceoverStage({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
        profileId: "profile-1",
      scriptPlan,
      repository,
      provider,
      getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
      options: { voiceId: "voice-1" },
    });

    expect(result.reused).toBe(true);
    expect(provider.generateVoiceover).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-audio",
      usage: "reused",
    });
    expect(repository.recordRunAssetUsage).toHaveBeenCalledWith({
      runId: "run-1",
      assetId: "asset-transcript",
      usage: "reused",
    });
  });

  it("uploads audio and transcript before recording reusable assets", async () => {
    const repository = createRepository();
    const provider = createProvider();

    const result = await generateVoiceoverStage({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
        profileId: "profile-1",
      scriptPlan,
      repository,
      provider,
      getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
      options: {
        voiceId: "voice-1",
        modelId: "eleven-test",
        voiceSettings: { stability: 0.3 },
        transcript: { phraseMode: "word-count", wordsPerPhrase: 4 },
      },
    });

    expect(result.reused).toBe(false);
    expect(provider.generateVoiceover).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "elevenlabs-key",
        voiceId: "voice-1",
        text: scriptPlan.voicePromptScript,
        transcriptText: scriptPlan.fullScript,
        modelId: "eleven-test",
      })
    );
    expect(repository.uploadRenderAssetBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "voiceover_audio",
        content: expect.any(Buffer),
        contentType: "audio/mpeg",
        extension: "mp3",
      })
    );
    expect(repository.uploadRenderAssetJson).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "voiceover_transcript",
        value: [
          {
            text: "Welcome to the kitchen.",
            offsets: { from: 0, to: 1200 },
          },
        ],
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "voiceover_audio",
        storagePath: "new/voiceover.mp3",
        fingerprint: expect.objectContaining({
          fullScript: scriptPlan.voicePromptScript,
          spokenScript: scriptPlan.fullScript,
          voiceId: "voice-1",
          modelId: "eleven-test",
          voiceSettings: expect.objectContaining({ stability: 0.3 }),
          transcript: expect.objectContaining({ phraseMode: "word-count" }),
          providerModuleVersion: "elevenlabs-voiceover-v2-eleven-v3-tags",
        }),
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "voiceover_transcript",
        storagePath: "new/transcript.json",
      })
    );
  });

  it("uses word-level transcript chunks by default for transition alignment", async () => {
    const repository = createRepository();
    const provider = createProvider();

    await generateVoiceoverStage({
      projectId: "project-1",
      runId: "run-1",
      userId: "user-1",
        profileId: "profile-1",
      scriptPlan,
      repository,
      provider,
      getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
      options: { voiceId: "voice-1" },
    });

    expect(provider.generateVoiceover).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "eleven_v3",
        voiceSettings: {
          stability: 0.22,
          similarity_boost: 0.74,
          style: 0.5,
          use_speaker_boost: true,
        },
        transcript: {
          phraseMode: "word-count",
          wordsPerPhrase: 1,
          useNormalizedAlignment: true,
        },
      })
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "voiceover_audio",
        fingerprint: expect.objectContaining({
          transcript: {
            phraseMode: "word-count",
            wordsPerPhrase: 1,
            useNormalizedAlignment: true,
          },
          voiceSettings: {
            stability: 0.22,
            similarity_boost: 0.74,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      })
    );
  });

  it("does not persist assets when the provider fails", async () => {
    const repository = createRepository();
    const provider = createProvider({
      generateVoiceover: vi.fn().mockRejectedValue(new Error("provider exploded")),
    });

    await expect(
      generateVoiceoverStage({
        projectId: "project-1",
        runId: "run-1",
        userId: "user-1",
        profileId: "profile-1",
        scriptPlan,
        repository,
        provider,
        getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
        options: { voiceId: "voice-1" },
      })
    ).rejects.toThrow("provider exploded");

    expect(repository.uploadRenderAssetBytes).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("does not record an audio asset when transcript upload fails", async () => {
    const repository = createRepository({
      uploadRenderAssetJson: vi.fn().mockResolvedValue(null),
    });
    const provider = createProvider();

    await expect(
      generateVoiceoverStage({
        projectId: "project-1",
        runId: "run-1",
        userId: "user-1",
        profileId: "profile-1",
        scriptPlan,
        repository,
        provider,
        getApiKey: vi.fn().mockResolvedValue("elevenlabs-key"),
        options: { voiceId: "voice-1" },
      })
    ).rejects.toMatchObject({ code: "VOICEOVER_TRANSCRIPT_UPLOAD_FAILED" });

    expect(repository.createAsset).not.toHaveBeenCalled();
    expect(repository.recordRunAssetUsage).not.toHaveBeenCalled();
  });
});
