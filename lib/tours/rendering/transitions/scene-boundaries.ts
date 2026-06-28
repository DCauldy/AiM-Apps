import type { RenderableTourProject, RenderableTourScene, TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";
import type { VoiceoverTranscript } from "../voiceover/tour-voiceover";
import { openRouterApps } from "@/lib/openrouter/apps";
import { createOpenRouterClient } from "@/lib/openrouter/client";
import { isOpenRouterError } from "@/lib/openrouter/errors";
import { hashJsonFingerprint } from "../fingerprint";

export const DEFAULT_SCENE_BOUNDARY_DETECTION_MODEL = "google/gemini-2.5-flash";
export const SCENE_BOUNDARY_DETECTION_PROMPT_VERSION = "tour-transition-detection-v1";

export type TranscriptChunk = {
  id: number;
  text: string;
  offsets: {
    from: number;
    to: number;
  };
};

export type SceneBoundary = {
  sceneId: string;
  chunkId: number;
  text?: string;
};

export type SceneTiming = {
  sceneId: string;
  title: string;
  durationSeconds: number;
  offsets: {
    from: number;
    to: number;
  };
};

export type SceneTimingSettings = {
  minDurationSeconds?: number;
  roundingIncrementSeconds?: number;
};

export type SceneBoundaryDetectionOptions = SceneTimingSettings & {
  modelId?: string;
  reuseExistingAssets?: boolean;
};

export type SceneBoundaryDetectionSceneInput = {
  id: string;
  title: string;
  sortOrder: number;
  proofedFacts: Array<{
    id: string;
    text: string;
    sortOrder: number;
    sourcePhotoId: string | null;
  }>;
};

export type SceneBoundaryDetectionProviderInput = {
  transcriptChunks: TranscriptChunk[];
  scenes: SceneBoundaryDetectionSceneInput[];
  modelId: string;
  promptVersion: string;
};

export type SceneBoundaryDetectionProvider = {
  detectSceneBoundaries(input: SceneBoundaryDetectionProviderInput): Promise<unknown>;
};

export type SceneBoundariesAssetValue = {
  transitions: SceneBoundary[];
  model: string;
  promptVersion: string;
  usage?: unknown;
};

export type SceneTimingsAssetValue = {
  durations: SceneTiming[];
  settings: Required<SceneTimingSettings>;
};

export type SceneBoundaryDetectionResult =
  | {
      reused: true;
      transitionsAsset: TourRenderAsset;
      durationsAsset: TourRenderAsset;
      transitions: SceneBoundary[];
      durations: SceneTiming[];
      transitionFingerprintHash: string;
      durationFingerprintHash: string;
      transitionFingerprint: SceneBoundaryFingerprint;
      durationFingerprint: SceneTimingFingerprint;
    }
  | {
      reused: false;
      transitionsAsset: TourRenderAsset;
      durationsAsset: TourRenderAsset;
      transitions: SceneBoundary[];
      durations: SceneTiming[];
      transitionFingerprintHash: string;
      durationFingerprintHash: string;
      transitionFingerprint: SceneBoundaryFingerprint;
      durationFingerprint: SceneTimingFingerprint;
    };

export type SceneBoundaryFingerprint = {
  kind: "scene_transitions";
  version: 1;
  promptVersion: string;
  modelId: string;
  transcriptChunks: TranscriptChunk[];
  scenes: SceneBoundaryDetectionSceneInput[];
};

export type SceneTimingFingerprint = {
  kind: "scene_durations";
  version: 1;
  transitionFingerprintHash: string;
  durationSettings: Required<SceneTimingSettings>;
  transcriptChunks: TranscriptChunk[];
  scenes: Array<{
    id: string;
    title: string;
    sortOrder: number;
  }>;
};

export class SceneBoundaryDetectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROJECT_HAS_NO_INCLUDED_SCENES"
      | "TRANSCRIPT_INVALID"
      | "PROVIDER_RESPONSE_INVALID"
      | "TRANSITION_TIMING_INVALID"
      | "TRANSITIONS_UPLOAD_FAILED"
      | "DURATIONS_UPLOAD_FAILED"
      | "TRANSITIONS_ASSET_CREATE_FAILED"
      | "DURATIONS_ASSET_CREATE_FAILED"
  ) {
    super(message);
    this.name = "SceneBoundaryDetectionError";
  }
}

const DEFAULT_DURATION_SETTINGS: Required<SceneTimingSettings> = {
  minDurationSeconds: 0.2,
  roundingIncrementSeconds: 0.001,
};

export function resolveSceneBoundaryDetectionOptions(
  options: SceneBoundaryDetectionOptions = {}
): {
  modelId: string;
  reuseExistingAssets: boolean;
  durationSettings: Required<SceneTimingSettings>;
} {
  return {
    modelId: options.modelId ?? DEFAULT_SCENE_BOUNDARY_DETECTION_MODEL,
    reuseExistingAssets: options.reuseExistingAssets !== false,
    durationSettings: {
      minDurationSeconds: options.minDurationSeconds ?? DEFAULT_DURATION_SETTINGS.minDurationSeconds,
      roundingIncrementSeconds:
        options.roundingIncrementSeconds ?? DEFAULT_DURATION_SETTINGS.roundingIncrementSeconds,
    },
  };
}

export function buildTranscriptChunks(transcript: VoiceoverTranscript): TranscriptChunk[] {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    throw new SceneBoundaryDetectionError(
      "Voiceover transcript is required for scene boundary detection.",
      "TRANSCRIPT_INVALID"
    );
  }

  const chunks: TranscriptChunk[] = [];
  for (const item of transcript) {
    const text = item.text?.trim();
    const from = item.offsets?.from;
    const to = item.offsets?.to;
    if (text && Number.isFinite(from) && Number.isFinite(to) && to > from) {
      chunks.push({
        id: chunks.length,
        text,
        offsets: { from, to },
      });
    }
  }

  if (chunks.length === 0) {
    throw new SceneBoundaryDetectionError(
      "Voiceover transcript did not include any usable chunks for scene boundary detection.",
      "TRANSCRIPT_INVALID"
    );
  }

  return chunks;
}

export function normalizeVoiceoverTranscript(value: unknown): VoiceoverTranscript {
  if (!Array.isArray(value)) {
    throw new SceneBoundaryDetectionError(
      "Stored voiceover transcript asset was not a transcript array.",
      "TRANSCRIPT_INVALID"
    );
  }

  return value.map((item, index) => {
    if (!isRecord(item) || !isRecord(item.offsets)) {
      throw new SceneBoundaryDetectionError(
        `Stored voiceover transcript item ${index} was invalid.`,
        "TRANSCRIPT_INVALID"
      );
    }

    return {
      text: String(item.text ?? ""),
      offsets: {
        from: Number(item.offsets.from),
        to: Number(item.offsets.to),
      },
    };
  });
}

export function buildSceneBoundaryFingerprint(input: {
  project: RenderableTourProject;
  transcriptChunks: TranscriptChunk[];
  modelId: string;
  promptVersion?: string;
}): SceneBoundaryFingerprint {
  return {
    kind: "scene_transitions",
    version: 1,
    promptVersion: input.promptVersion ?? SCENE_BOUNDARY_DETECTION_PROMPT_VERSION,
    modelId: input.modelId,
    transcriptChunks: input.transcriptChunks,
    scenes: buildSceneBoundaryDetectionSceneInputs(includedRenderableScenes(input.project)),
  };
}

export function buildSceneTimingFingerprint(input: {
  project: RenderableTourProject;
  transcriptChunks: TranscriptChunk[];
  transitionFingerprintHash: string;
  durationSettings: Required<SceneTimingSettings>;
}): SceneTimingFingerprint {
  return {
    kind: "scene_durations",
    version: 1,
    transitionFingerprintHash: input.transitionFingerprintHash,
    durationSettings: input.durationSettings,
    transcriptChunks: input.transcriptChunks,
    scenes: includedRenderableScenes(input.project).map((scene) => ({
      id: scene.id,
      title: scene.title,
      sortOrder: scene.sortOrder,
    })),
  };
}

export function hashSceneBoundaryFingerprint(fingerprint: SceneBoundaryFingerprint): string {
  return hashJsonFingerprint(fingerprint);
}

export function hashSceneTimingFingerprint(fingerprint: SceneTimingFingerprint): string {
  return hashJsonFingerprint(fingerprint);
}

export function normalizeSceneBoundaries(input: {
  providerOutput: unknown;
  scenes: SceneBoundaryDetectionSceneInput[];
  transcriptChunks: TranscriptChunk[];
}): SceneBoundary[] {
  const parsed = parseSceneBoundaryProviderOutput(input.providerOutput);
  const transitions = parsed.transitions.map((transition) => {
    if (!isRecord(transition)) {
      throw new SceneBoundaryDetectionError(
        "Scene boundary response contained a non-object boundary.",
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    return {
      sceneId: String(transition.sceneId ?? ""),
      chunkId: Number(transition.chunkId ?? transition.id),
      text: typeof transition.text === "string" ? transition.text : undefined,
    };
  });

  const normalizedTransitions = anchorFirstBoundaryToTranscriptStart(
    transitions,
    input.transcriptChunks
  );

  validateBoundariesInSceneOrder({
    transitions: normalizedTransitions,
    scenes: input.scenes,
    transcriptChunks: input.transcriptChunks,
  });

  return normalizedTransitions;
}

export function deriveSceneTimings(input: {
  transitions: SceneBoundary[];
  scenes: SceneBoundaryDetectionSceneInput[];
  transcriptChunks: TranscriptChunk[];
  settings?: SceneTimingSettings;
}): SceneTiming[] {
  const settings = {
    ...DEFAULT_DURATION_SETTINGS,
    ...(input.settings ?? {}),
  };
  const chunkById = new Map(input.transcriptChunks.map((chunk) => [chunk.id, chunk]));
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene]));

  return input.transitions.map((transition, index) => {
    const scene = sceneById.get(transition.sceneId);
    const currentChunk = chunkById.get(transition.chunkId);
    const nextTransition = input.transitions[index + 1];
    const nextChunk =
      nextTransition === undefined ? undefined : chunkById.get(nextTransition.chunkId);
    const lastChunk = input.transcriptChunks[input.transcriptChunks.length - 1];
    if (!scene || !currentChunk || !lastChunk) {
      throw new SceneBoundaryDetectionError(
        "Scene transition timing could not be mapped to scenes and transcript chunks.",
        "TRANSITION_TIMING_INVALID"
      );
    }

    const from = currentChunk.offsets.from;
    const to = nextChunk?.offsets.from ?? lastChunk.offsets.to;
    const durationSeconds = roundDuration((to - from) / 1000, settings.roundingIncrementSeconds);
    if (to <= from || durationSeconds < settings.minDurationSeconds) {
      throw new SceneBoundaryDetectionError(
        `Scene "${scene.title}" has invalid transition timing.`,
        "TRANSITION_TIMING_INVALID"
      );
    }

    return {
      sceneId: scene.id,
      title: scene.title,
      durationSeconds,
      offsets: { from, to },
    };
  });
}

export async function detectSceneBoundariesAndTimingsStage(input: {
  project: RenderableTourProject;
  repository: TourRenderRepository;
  runId: string;
  userId: string;
  transcript: VoiceoverTranscript;
  provider: SceneBoundaryDetectionProvider;
  options?: SceneBoundaryDetectionOptions;
}): Promise<SceneBoundaryDetectionResult> {
  const resolvedOptions = resolveSceneBoundaryDetectionOptions(input.options);
  const includedScenes = includedRenderableScenes(input.project);
  if (includedScenes.length === 0) {
    throw new SceneBoundaryDetectionError(
      "Tour render needs at least one included scene for scene boundary detection.",
      "PROJECT_HAS_NO_INCLUDED_SCENES"
    );
  }

  const scenes = buildSceneBoundaryDetectionSceneInputs(includedScenes);
  const transcriptChunks = buildTranscriptChunks(input.transcript);
  const transitionFingerprint = buildSceneBoundaryFingerprint({
    project: input.project,
    transcriptChunks,
    modelId: resolvedOptions.modelId,
  });
  const transitionFingerprintHash = hashSceneBoundaryFingerprint(transitionFingerprint);
  const durationFingerprint = buildSceneTimingFingerprint({
    project: input.project,
    transcriptChunks,
    transitionFingerprintHash,
    durationSettings: resolvedOptions.durationSettings,
  });
  const durationFingerprintHash = hashSceneTimingFingerprint(durationFingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const [transitionsAsset, durationsAsset] = await Promise.all([
      input.repository.findReusableAsset({
        projectId: input.project.project.id,
        kind: "scene_transitions",
        fingerprintHash: transitionFingerprintHash,
        sceneId: null,
      }),
      input.repository.findReusableAsset({
        projectId: input.project.project.id,
        kind: "scene_durations",
        fingerprintHash: durationFingerprintHash,
        sceneId: null,
      }),
    ]);

    if (transitionsAsset && durationsAsset) {
      const [transitionValue, durationValue] = await Promise.all([
        downloadAssetJson(input.repository, transitionsAsset),
        downloadAssetJson(input.repository, durationsAsset),
      ]);
      const transitions = normalizeStoredBoundaries(transitionValue, scenes, transcriptChunks);
      const durations = normalizeStoredTimings(durationValue, scenes, transcriptChunks);

      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: transitionsAsset.id,
        usage: "reused",
      });
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: durationsAsset.id,
        usage: "reused",
      });

      return {
        reused: true,
        transitionsAsset,
        durationsAsset,
        transitions,
        durations,
        transitionFingerprintHash,
        durationFingerprintHash,
        transitionFingerprint,
        durationFingerprint,
      };
    }
  }

  const providerOutput = await input.provider.detectSceneBoundaries({
    transcriptChunks,
    scenes,
    modelId: resolvedOptions.modelId,
    promptVersion: SCENE_BOUNDARY_DETECTION_PROMPT_VERSION,
  });
  const transitions = normalizeSceneBoundaries({
    providerOutput,
    scenes,
    transcriptChunks,
  });
  const durations = deriveSceneTimings({
    transitions,
    scenes,
    transcriptChunks,
    settings: resolvedOptions.durationSettings,
  });

  const transitionsUpload = await input.repository.uploadRenderAssetJson({
    userId: input.userId,
    projectId: input.project.project.id,
    runId: input.runId,
    kind: "scene_transitions",
    value: {
      transitions,
      model: resolvedOptions.modelId,
      promptVersion: SCENE_BOUNDARY_DETECTION_PROMPT_VERSION,
    } satisfies SceneBoundariesAssetValue,
  });
  if (!transitionsUpload) {
    throw new SceneBoundaryDetectionError(
      "Could not upload scene transitions asset.",
      "TRANSITIONS_UPLOAD_FAILED"
    );
  }

  const durationsUpload = await input.repository.uploadRenderAssetJson({
    userId: input.userId,
    projectId: input.project.project.id,
    runId: input.runId,
    kind: "scene_durations",
    value: {
      durations,
      settings: resolvedOptions.durationSettings,
    } satisfies SceneTimingsAssetValue,
  });
  if (!durationsUpload) {
    throw new SceneBoundaryDetectionError(
      "Could not upload scene durations asset.",
      "DURATIONS_UPLOAD_FAILED"
    );
  }

  const transitionsAsset = await input.repository.createAsset({
    projectId: input.project.project.id,
    createdByRunId: input.runId,
    kind: "scene_transitions",
    storageBucket: transitionsUpload.storageBucket,
    storagePath: transitionsUpload.storagePath,
    contentType: transitionsUpload.contentType,
    fingerprintHash: transitionFingerprintHash,
    fingerprint: transitionFingerprint,
    reusable: true,
    metadata: {
      model: resolvedOptions.modelId,
      promptVersion: SCENE_BOUNDARY_DETECTION_PROMPT_VERSION,
      sceneCount: transitions.length,
    },
  });
  if (!transitionsAsset) {
    throw new SceneBoundaryDetectionError(
      "Could not create scene transitions asset record.",
      "TRANSITIONS_ASSET_CREATE_FAILED"
    );
  }

  const durationsAsset = await input.repository.createAsset({
    projectId: input.project.project.id,
    createdByRunId: input.runId,
    kind: "scene_durations",
    storageBucket: durationsUpload.storageBucket,
    storagePath: durationsUpload.storagePath,
    contentType: durationsUpload.contentType,
    fingerprintHash: durationFingerprintHash,
    fingerprint: durationFingerprint,
    reusable: true,
    metadata: {
      sceneCount: durations.length,
      totalDurationSeconds: roundDuration(
        durations.reduce((sum, duration) => sum + duration.durationSeconds, 0),
        resolvedOptions.durationSettings.roundingIncrementSeconds
      ),
    },
  });
  if (!durationsAsset) {
    throw new SceneBoundaryDetectionError(
      "Could not create scene durations asset record.",
      "DURATIONS_ASSET_CREATE_FAILED"
    );
  }

  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: transitionsAsset.id,
    usage: "created",
  });
  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: durationsAsset.id,
    usage: "created",
  });

  return {
    reused: false,
    transitionsAsset,
    durationsAsset,
    transitions,
    durations,
    transitionFingerprintHash,
    durationFingerprintHash,
    transitionFingerprint,
    durationFingerprint,
  };
}

export function createOpenRouterSceneBoundaryDetectionProvider(options: {
  apiKey: string;
  fetcher?: typeof fetch;
  appInfo?: {
    referer?: string;
    title?: string;
  };
}): SceneBoundaryDetectionProvider {
  const client = createOpenRouterClient({
    apiKey: options.apiKey,
    fetcher: options.fetcher,
    app: {
      title: options.appInfo?.title ?? openRouterApps.tours.title,
      referer: options.appInfo?.referer ?? openRouterApps.tours.referer,
    },
  });

  return {
    async detectSceneBoundaries(input) {
      if (!options.apiKey) {
        throw new SceneBoundaryDetectionError(
          "OpenRouter API key is required for scene boundary detection.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }

      try {
        const result = await client.chat.json<Record<string, unknown>>({
          operation: "tour.transition.detect",
          model: input.modelId,
          messages: [
            {
              role: "system",
              content: [
                "You are a video editor mapping narrated transcript chunks to scene changes.",
                "Return only valid JSON.",
                "Return exactly one transition for each supplied scene, in supplied scene order.",
                "Use exact sceneId values from the user input.",
                "Transcript chunks are word-level; choose the exact first word chunk where each scene's narration starts.",
                "Use chunkId 0 for the first scene and strictly increasing chunkId values after that.",
                "Do not include markdown, comments, labels, or text outside the JSON object.",
                "Respond with schema: {\"transitions\":[{\"sceneId\":\"...\",\"chunkId\":0,\"text\":\"...\"}]}",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                promptVersion: input.promptVersion,
                transcript: input.transcriptChunks,
                scenes: input.scenes.map((scene, index) => ({
                  index,
                  sceneId: scene.id,
                  title: scene.title,
                  proofedFacts: scene.proofedFacts.map((fact) => fact.text),
                })),
              }),
            },
          ],
        });

        return {
          ...result.value,
          usage: result.usage,
        };
      } catch (error) {
        throw new SceneBoundaryDetectionError(
          isOpenRouterError(error)
            ? error.message
            : "OpenRouter scene boundary detection failed.",
          "PROVIDER_RESPONSE_INVALID"
        );
      }
    },
  };
}

function parseSceneBoundaryProviderOutput(value: unknown): { transitions: unknown[] } {
  if (typeof value === "string") {
    try {
      return parseSceneBoundaryProviderOutput(JSON.parse(value));
    } catch {
      throw new SceneBoundaryDetectionError(
        "Scene boundary response was not valid JSON.",
        "PROVIDER_RESPONSE_INVALID"
      );
    }
  }

  if (!isRecord(value) || !Array.isArray(value.transitions)) {
    throw new SceneBoundaryDetectionError(
      "Scene boundary response missing transitions array.",
      "PROVIDER_RESPONSE_INVALID"
    );
  }

  return { transitions: value.transitions };
}

function validateBoundariesInSceneOrder(input: {
  transitions: SceneBoundary[];
  scenes: SceneBoundaryDetectionSceneInput[];
  transcriptChunks: TranscriptChunk[];
}): void {
  if (input.transitions.length !== input.scenes.length) {
    throw new SceneBoundaryDetectionError(
      `Scene boundary response returned ${input.transitions.length} transitions for ${input.scenes.length} scenes.`,
      "PROVIDER_RESPONSE_INVALID"
    );
  }

  const chunkIds = new Set(input.transcriptChunks.map((chunk) => chunk.id));
  for (const [index, scene] of input.scenes.entries()) {
    const transition = input.transitions[index];
    if (transition.sceneId !== scene.id) {
      throw new SceneBoundaryDetectionError(
        `Scene transition ${index} maps to ${transition.sceneId}, expected ${scene.id}.`,
        "PROVIDER_RESPONSE_INVALID"
      );
    }
    if (!chunkIds.has(transition.chunkId)) {
      throw new SceneBoundaryDetectionError(
        `Scene boundary for ${scene.id} points at missing transcript chunk ${transition.chunkId}.`,
        "TRANSITION_TIMING_INVALID"
      );
    }
    if (index === 0 && transition.chunkId !== input.transcriptChunks[0]?.id) {
      throw new SceneBoundaryDetectionError(
        "First scene boundary must start at the first transcript chunk.",
        "TRANSITION_TIMING_INVALID"
      );
    }

    const previous = input.transitions[index - 1];
    if (previous && transition.chunkId <= previous.chunkId) {
      throw new SceneBoundaryDetectionError(
        "Scene boundaries must use strictly increasing transcript chunks.",
        "TRANSITION_TIMING_INVALID"
      );
    }
  }
}

function anchorFirstBoundaryToTranscriptStart(
  transitions: SceneBoundary[],
  transcriptChunks: TranscriptChunk[]
): SceneBoundary[] {
  const firstChunk = transcriptChunks[0];
  const firstTransition = transitions[0];
  if (!firstChunk || !firstTransition || firstTransition.chunkId === firstChunk.id) {
    return transitions;
  }

  return [
    {
      ...firstTransition,
      chunkId: firstChunk.id,
    },
    ...transitions.slice(1),
  ];
}

function normalizeStoredBoundaries(
  value: unknown,
  scenes: SceneBoundaryDetectionSceneInput[],
  transcriptChunks: TranscriptChunk[]
): SceneBoundary[] {
  const transitionsValue = isRecord(value) ? value.transitions : undefined;
  return normalizeSceneBoundaries({
    providerOutput: { transitions: transitionsValue },
    scenes,
    transcriptChunks,
  });
}

function normalizeStoredTimings(
  value: unknown,
  scenes: SceneBoundaryDetectionSceneInput[],
  transcriptChunks: TranscriptChunk[]
): SceneTiming[] {
  if (!isRecord(value) || !Array.isArray(value.durations)) {
    throw new SceneBoundaryDetectionError(
      "Stored scene duration asset did not include durations.",
      "TRANSITION_TIMING_INVALID"
    );
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  return value.durations.map((duration, index) => {
    if (!isRecord(duration) || !isRecord(duration.offsets)) {
      throw new SceneBoundaryDetectionError(
        `Stored scene duration ${index} was invalid.`,
        "TRANSITION_TIMING_INVALID"
      );
    }
    const sceneId = String(duration.sceneId ?? "");
    const scene = sceneById.get(sceneId);
    const from = Number(duration.offsets.from);
    const to = Number(duration.offsets.to);
    const durationSeconds = Number(duration.durationSeconds);
    const startsAtKnownChunk = transcriptChunks.some((chunk) => chunk.offsets.from === from);
    if (!scene || !Number.isFinite(durationSeconds) || !startsAtKnownChunk || to <= from) {
      throw new SceneBoundaryDetectionError(
        `Stored scene duration ${index} could not be validated.`,
        "TRANSITION_TIMING_INVALID"
      );
    }

    return {
      sceneId,
      title: scene.title,
      durationSeconds,
      offsets: { from, to },
    };
  });
}

async function downloadAssetJson(
  repository: TourRenderRepository,
  asset: TourRenderAsset
): Promise<unknown> {
  if (asset.storageBucket !== "tours-generated-media" || !asset.storagePath) return null;
  return repository.downloadRenderAssetJson({
    storageBucket: asset.storageBucket,
    storagePath: asset.storagePath,
  });
}

function includedRenderableScenes(project: RenderableTourProject): RenderableTourScene[] {
  return project.scenes
    .filter((scene) => scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function buildSceneBoundaryDetectionSceneInputs(
  includedScenes: RenderableTourScene[]
): SceneBoundaryDetectionSceneInput[] {
  return includedScenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    sortOrder: scene.sortOrder,
    proofedFacts: scene.proofedFacts.map((fact) => ({
      id: fact.id,
      text: fact.text,
      sortOrder: fact.sortOrder,
      sourcePhotoId: fact.sourcePhotoId,
    })),
  }));
}

function roundDuration(durationSeconds: number, incrementSeconds: number): number {
  if (!Number.isFinite(durationSeconds)) return durationSeconds;
  const increment = Number.isFinite(incrementSeconds) && incrementSeconds > 0 ? incrementSeconds : 0.1;
  return Math.round(durationSeconds / increment) * increment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
