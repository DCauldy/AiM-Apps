import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getProfileApiKey } from "@/lib/user-api-keys/service";
import type { TourScriptPlan } from "../generation/tour-script-planning";
import type { TourRenderAsset, TourRenderRepository } from "../repositories/tour-render.repository";
import { hashJsonFingerprint } from "../fingerprint";

export const ELEVENLABS_VOICEOVER_PROVIDER_VERSION = "elevenlabs-voiceover-v2-eleven-v3-tags";
export const DEFAULT_ELEVENLABS_TTS_MODEL = "eleven_v3";
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

export type ElevenLabsVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
};

export type ElevenLabsTranscriptOptions = {
  phraseMode?: "sentence" | "word-count";
  wordsPerPhrase?: number;
  useNormalizedAlignment?: boolean;
};

export type VoiceoverTranscriptItem = {
  text: string;
  offsets: {
    from: number;
    to: number;
  };
};

export type VoiceoverTranscript = VoiceoverTranscriptItem[];

export type VoiceoverProviderInput = {
  apiKey: string;
  voiceId: string;
  text: string;
  transcriptText?: string;
  outputAudioPath: string;
  modelId: string;
  outputFormat: string;
  voiceSettings: ElevenLabsVoiceSettings;
  transcript: Required<ElevenLabsTranscriptOptions>;
};

export type VoiceoverProviderResult = {
  audioFilePath: string;
  transcript: VoiceoverTranscript;
  metadata?: Record<string, unknown>;
};

export type VoiceoverProvider = {
  generateVoiceover(input: VoiceoverProviderInput): Promise<VoiceoverProviderResult>;
};

export type VoiceoverStageOptions = {
  reuseExistingAssets?: boolean;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  transcript?: ElevenLabsTranscriptOptions;
};

export type VoiceoverFingerprint = {
  kind: "voiceover";
  version: 1;
  provider: "elevenlabs";
  providerModuleVersion: string;
  fullScript: string;
  spokenScript: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings: ElevenLabsVoiceSettings;
  transcript: Required<ElevenLabsTranscriptOptions>;
};

export type VoiceoverStageResult =
  | {
      reused: true;
      audioAsset: TourRenderAsset;
      transcriptAsset: TourRenderAsset;
      fingerprintHash: string;
      fingerprint: VoiceoverFingerprint;
    }
  | {
      reused: false;
      audioAsset: TourRenderAsset;
      transcriptAsset: TourRenderAsset;
      transcript: VoiceoverTranscript;
      fingerprintHash: string;
      fingerprint: VoiceoverFingerprint;
    };

export class TourVoiceoverError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MISSING_ELEVENLABS_API_KEY"
      | "MISSING_ELEVENLABS_VOICE_ID"
      | "MISSING_SCRIPT_TEXT"
      | "ELEVENLABS_TTS_FAILED"
      | "ELEVENLABS_TTS_RESPONSE_INVALID"
      | "VOICEOVER_AUDIO_UPLOAD_FAILED"
      | "VOICEOVER_TRANSCRIPT_UPLOAD_FAILED"
      | "VOICEOVER_AUDIO_ASSET_CREATE_FAILED"
      | "VOICEOVER_TRANSCRIPT_ASSET_CREATE_FAILED"
      | "TRANSCRIPT_ALIGNMENT_FAILED"
      | "UNSUPPORTED_PHRASE_SEGMENTATION"
  ) {
    super(message);
    this.name = "TourVoiceoverError";
  }
}

type ElevenLabsTtsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type ElevenLabsTtsWithTimestampsResponse = {
  audio_base64: string;
  alignment: ElevenLabsTtsAlignment;
  normalized_alignment?: ElevenLabsTtsAlignment;
};

type PhraseBoundary = {
  text: string;
  fromCharacterIndex: number;
  toCharacterIndex: number;
};

const DEFAULT_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.22,
  similarity_boost: 0.74,
  style: 0.5,
  use_speaker_boost: true,
};

const DEFAULT_TRANSCRIPT_OPTIONS: Required<ElevenLabsTranscriptOptions> = {
  phraseMode: "word-count",
  wordsPerPhrase: 1,
  useNormalizedAlignment: true,
};

export function resolveVoiceoverStageOptions(
  options: VoiceoverStageOptions = {}
): {
  reuseExistingAssets: boolean;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings: ElevenLabsVoiceSettings;
  transcript: Required<ElevenLabsTranscriptOptions>;
} {
  return {
    reuseExistingAssets: options.reuseExistingAssets !== false,
    voiceId: options.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "",
    modelId: options.modelId ?? DEFAULT_ELEVENLABS_TTS_MODEL,
    outputFormat: options.outputFormat ?? DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
    voiceSettings: {
      ...DEFAULT_VOICE_SETTINGS,
      ...(options.voiceSettings ?? {}),
    },
    transcript: {
      ...DEFAULT_TRANSCRIPT_OPTIONS,
      ...(options.transcript ?? {}),
    },
  };
}

export function buildVoiceoverFingerprint(input: {
  scriptPlan: TourScriptPlan;
  voicePromptScript?: string;
  spokenScript?: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings: ElevenLabsVoiceSettings;
  transcript: Required<ElevenLabsTranscriptOptions>;
}): VoiceoverFingerprint {
  return {
    kind: "voiceover",
    version: 1,
    provider: "elevenlabs",
    providerModuleVersion: ELEVENLABS_VOICEOVER_PROVIDER_VERSION,
    fullScript: input.voicePromptScript ?? getVoiceoverPromptText(input.scriptPlan),
    spokenScript: input.spokenScript ?? input.scriptPlan.fullScript,
    voiceId: input.voiceId,
    modelId: input.modelId,
    outputFormat: input.outputFormat,
    voiceSettings: input.voiceSettings,
    transcript: input.transcript,
  };
}

export function hashVoiceoverFingerprint(fingerprint: VoiceoverFingerprint): string {
  return hashJsonFingerprint(fingerprint);
}

export async function generateVoiceoverStage(input: {
  projectId: string;
  runId: string;
  userId: string;
  /** Platform profile the key lookup is scoped to. Required since
   *  20260615000002 — see lib/profiles/resolve-for-render.ts for
   *  how the orchestrator picks this. */
  profileId: string;
  scriptPlan: TourScriptPlan;
  repository: TourRenderRepository;
  provider: VoiceoverProvider;
  getApiKey?: typeof getProfileApiKey;
  options?: VoiceoverStageOptions;
}): Promise<VoiceoverStageResult> {
  const resolvedOptions = resolveVoiceoverStageOptions(input.options);
  const voicePromptScript = getVoiceoverPromptText(input.scriptPlan);
  const spokenScript = input.scriptPlan.fullScript.trim();
  if (!voicePromptScript) {
    throw new TourVoiceoverError("Voiceover generation requires script text.", "MISSING_SCRIPT_TEXT");
  }
  if (!resolvedOptions.voiceId.trim()) {
    throw new TourVoiceoverError("ElevenLabs voice id is required.", "MISSING_ELEVENLABS_VOICE_ID");
  }

  const fingerprint = buildVoiceoverFingerprint({
    scriptPlan: input.scriptPlan,
    voicePromptScript,
    spokenScript,
    voiceId: resolvedOptions.voiceId,
    modelId: resolvedOptions.modelId,
    outputFormat: resolvedOptions.outputFormat,
    voiceSettings: resolvedOptions.voiceSettings,
    transcript: resolvedOptions.transcript,
  });
  const fingerprintHash = hashVoiceoverFingerprint(fingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const [audioAsset, transcriptAsset] = await Promise.all([
      input.repository.findReusableAsset({
        projectId: input.projectId,
        kind: "voiceover_audio",
        fingerprintHash,
        sceneId: null,
      }),
      input.repository.findReusableAsset({
        projectId: input.projectId,
        kind: "voiceover_transcript",
        fingerprintHash,
        sceneId: null,
      }),
    ]);

    if (audioAsset && transcriptAsset) {
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: audioAsset.id,
        usage: "reused",
      });
      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: transcriptAsset.id,
        usage: "reused",
      });
      return {
        reused: true,
        audioAsset,
        transcriptAsset,
        fingerprintHash,
        fingerprint,
      };
    }
  }

  const apiKey = await (input.getApiKey ?? getProfileApiKey)(input.profileId, "elevenlabs");
  if (!apiKey) {
    throw new TourVoiceoverError(
      "ElevenLabs API key is required for voiceover generation.",
      "MISSING_ELEVENLABS_API_KEY"
    );
  }

  const scratchDir = path.join(tmpdir(), "aim-tours-render", input.runId);
  const outputAudioPath = path.join(scratchDir, `voiceover-${Date.now()}.mp3`);
  try {
    await mkdir(scratchDir, { recursive: true });
    const generated = await input.provider.generateVoiceover({
      apiKey,
      voiceId: resolvedOptions.voiceId,
      text: voicePromptScript,
      transcriptText: spokenScript,
      outputAudioPath,
      modelId: resolvedOptions.modelId,
      outputFormat: resolvedOptions.outputFormat,
      voiceSettings: resolvedOptions.voiceSettings,
      transcript: resolvedOptions.transcript,
    });
    const audioBuffer = await readFile(generated.audioFilePath);

    const audioUpload = await input.repository.uploadRenderAssetBytes({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "voiceover_audio",
      content: audioBuffer,
      contentType: "audio/mpeg",
      extension: "mp3",
    });
    if (!audioUpload) {
      throw new TourVoiceoverError(
        "Could not upload voiceover audio asset.",
        "VOICEOVER_AUDIO_UPLOAD_FAILED"
      );
    }

    const transcriptUpload = await input.repository.uploadRenderAssetJson({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      kind: "voiceover_transcript",
      value: generated.transcript,
    });
    if (!transcriptUpload) {
      throw new TourVoiceoverError(
        "Could not upload voiceover transcript asset.",
        "VOICEOVER_TRANSCRIPT_UPLOAD_FAILED"
      );
    }

    const audioAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "voiceover_audio",
      storageBucket: audioUpload.storageBucket,
      storagePath: audioUpload.storagePath,
      contentType: audioUpload.contentType,
      fingerprintHash,
      fingerprint,
      reusable: true,
      metadata: {
        provider: "elevenlabs",
        voiceId: resolvedOptions.voiceId,
        modelId: resolvedOptions.modelId,
        transcriptPhraseCount: generated.transcript.length,
        ...(generated.metadata ?? {}),
      },
    });
    if (!audioAsset) {
      throw new TourVoiceoverError(
        "Could not create voiceover audio asset record.",
        "VOICEOVER_AUDIO_ASSET_CREATE_FAILED"
      );
    }

    const transcriptAsset = await input.repository.createAsset({
      projectId: input.projectId,
      createdByRunId: input.runId,
      kind: "voiceover_transcript",
      storageBucket: transcriptUpload.storageBucket,
      storagePath: transcriptUpload.storagePath,
      contentType: transcriptUpload.contentType,
      fingerprintHash,
      fingerprint,
      reusable: true,
      metadata: {
        provider: "elevenlabs",
        voiceId: resolvedOptions.voiceId,
        modelId: resolvedOptions.modelId,
        phraseCount: generated.transcript.length,
      },
    });
    if (!transcriptAsset) {
      throw new TourVoiceoverError(
        "Could not create voiceover transcript asset record.",
        "VOICEOVER_TRANSCRIPT_ASSET_CREATE_FAILED"
      );
    }

    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: audioAsset.id,
      usage: "created",
    });
    await input.repository.recordRunAssetUsage({
      runId: input.runId,
      assetId: transcriptAsset.id,
      usage: "created",
    });

    return {
      reused: false,
      audioAsset,
      transcriptAsset,
      transcript: generated.transcript,
      fingerprintHash,
      fingerprint,
    };
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

export function createElevenLabsVoiceoverProvider(
  options: { fetch?: typeof fetch } = {}
): VoiceoverProvider {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async generateVoiceover(input) {
      let response: Response;
      try {
        response = await fetchImpl(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${encodeURIComponent(input.outputFormat)}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": input.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: input.text,
              model_id: input.modelId,
              language_code: "en",
              voice_settings: input.voiceSettings,
            }),
          }
        );
      } catch {
        throw new TourVoiceoverError("ElevenLabs TTS request failed.", "ELEVENLABS_TTS_FAILED");
      }

      if (!response.ok) {
        throw new TourVoiceoverError("ElevenLabs TTS request failed.", "ELEVENLABS_TTS_FAILED");
      }

      const payload = await response.json().catch(() => null);
      if (!isElevenLabsTtsWithTimestampsResponse(payload)) {
        throw new TourVoiceoverError(
          "ElevenLabs TTS response did not include audio and alignment.",
          "ELEVENLABS_TTS_RESPONSE_INVALID"
        );
      }

      const audioBuffer = Buffer.from(payload.audio_base64, "base64");
      if (audioBuffer.length === 0) {
        throw new TourVoiceoverError(
          "ElevenLabs TTS response included empty audio.",
          "ELEVENLABS_TTS_RESPONSE_INVALID"
        );
      }

      await mkdir(path.dirname(input.outputAudioPath), { recursive: true });
      await writeFile(input.outputAudioPath, audioBuffer);

      return {
        audioFilePath: input.outputAudioPath,
        transcript: buildPhraseLevelTranscript({
          text: input.text,
          transcriptText: input.transcriptText,
          response: payload,
          options: input.transcript,
        }),
      };
    },
  };
}

function buildPhraseLevelTranscript(input: {
  text: string;
  transcriptText?: string;
  response: ElevenLabsTtsWithTimestampsResponse;
  options: Required<ElevenLabsTranscriptOptions>;
}): VoiceoverTranscript {
  const alignment =
    input.options.useNormalizedAlignment && input.response.normalized_alignment
      ? input.response.normalized_alignment
      : input.response.alignment;

  assertUsableAlignment(alignment);

  const alignmentCharacters = alignment.characters;
  const textCharacters = Array.from(input.transcriptText ?? stripElevenLabsAudioTags(input.text));
  const displayCharacters =
    input.options.useNormalizedAlignment || textCharacters.length !== alignmentCharacters.length
      ? alignmentCharacters
      : textCharacters;

  const phraseBoundaries = segmentPhrases(
    displayCharacters,
    input.options.phraseMode,
    input.options.wordsPerPhrase
  );

  return phraseBoundaries.map((phrase) => {
    const fromSeconds = alignment.character_start_times_seconds[phrase.fromCharacterIndex];
    const toSeconds = alignment.character_end_times_seconds[phrase.toCharacterIndex - 1];
    if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds)) {
      throw new TourVoiceoverError(
        `Could not map phrase "${phrase.text}" to valid ElevenLabs alignment times.`,
        "TRANSCRIPT_ALIGNMENT_FAILED"
      );
    }

    const from = Math.round(fromSeconds * 1000);
    const to = Math.round(toSeconds * 1000);
    return {
      text: phrase.text,
      offsets: {
        from,
        to: Math.max(to, from),
      },
    };
  });
}

function getVoiceoverPromptText(scriptPlan: TourScriptPlan): string {
  return (scriptPlan.voicePromptScript ?? scriptPlan.fullScript).trim();
}

function stripElevenLabsAudioTags(text: string): string {
  return text.replace(/\[[^\]\n]{1,160}\]\s*/g, "").trim();
}

function isElevenLabsTtsWithTimestampsResponse(
  payload: unknown
): payload is ElevenLabsTtsWithTimestampsResponse {
  if (!payload || typeof payload !== "object") return false;
  const response = payload as Partial<ElevenLabsTtsWithTimestampsResponse>;
  return (
    typeof response.audio_base64 === "string" &&
    isElevenLabsTtsAlignment(response.alignment) &&
    (response.normalized_alignment === undefined ||
      isElevenLabsTtsAlignment(response.normalized_alignment))
  );
}

function isElevenLabsTtsAlignment(payload: unknown): payload is ElevenLabsTtsAlignment {
  if (!payload || typeof payload !== "object") return false;
  const alignment = payload as Partial<ElevenLabsTtsAlignment>;
  return (
    Array.isArray(alignment.characters) &&
    alignment.characters.every((character) => typeof character === "string") &&
    Array.isArray(alignment.character_start_times_seconds) &&
    alignment.character_start_times_seconds.every((seconds) => typeof seconds === "number") &&
    Array.isArray(alignment.character_end_times_seconds) &&
    alignment.character_end_times_seconds.every((seconds) => typeof seconds === "number")
  );
}

function assertUsableAlignment(alignment: ElevenLabsTtsAlignment): void {
  const characterCount = alignment.characters.length;
  if (
    characterCount !== alignment.character_start_times_seconds.length ||
    characterCount !== alignment.character_end_times_seconds.length
  ) {
    throw new TourVoiceoverError(
      "ElevenLabs alignment arrays must have matching lengths.",
      "TRANSCRIPT_ALIGNMENT_FAILED"
    );
  }

  if (characterCount === 0) {
    throw new TourVoiceoverError(
      "ElevenLabs alignment did not include any characters.",
      "TRANSCRIPT_ALIGNMENT_FAILED"
    );
  }
}

function segmentPhrases(
  characters: string[],
  phraseMode: ElevenLabsTranscriptOptions["phraseMode"],
  wordsPerPhrase: number
): PhraseBoundary[] {
  if (phraseMode === "sentence") {
    return segmentSentences(characters);
  }
  if (phraseMode === "word-count") {
    return segmentByWordCount(characters, wordsPerPhrase);
  }

  throw new TourVoiceoverError(
    `Unsupported phrase segmentation mode: ${phraseMode}`,
    "UNSUPPORTED_PHRASE_SEGMENTATION"
  );
}

function segmentSentences(characters: string[]): PhraseBoundary[] {
  const phrases: PhraseBoundary[] = [];
  let phraseStart = 0;

  for (let index = 0; index < characters.length; index += 1) {
    if (!isSentenceTerminator(characters[index])) continue;

    let phraseEnd = index + 1;
    while (phraseEnd < characters.length && isClosingSentencePunctuation(characters[phraseEnd])) {
      phraseEnd += 1;
    }

    pushTrimmedPhrase(phrases, characters, phraseStart, phraseEnd);
    phraseStart = phraseEnd;
  }

  pushTrimmedPhrase(phrases, characters, phraseStart, characters.length);
  return phrases;
}

function segmentByWordCount(characters: string[], wordsPerPhrase: number): PhraseBoundary[] {
  const normalizedWordsPerPhrase = Math.floor(wordsPerPhrase);
  if (!Number.isFinite(normalizedWordsPerPhrase) || normalizedWordsPerPhrase < 1) {
    throw new TourVoiceoverError(
      "wordsPerPhrase must be a positive integer.",
      "UNSUPPORTED_PHRASE_SEGMENTATION"
    );
  }

  const words = findWordBoundaries(characters);
  const phrases: PhraseBoundary[] = [];
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += normalizedWordsPerPhrase) {
    const firstWord = words[wordIndex];
    const lastWord = words[Math.min(wordIndex + normalizedWordsPerPhrase, words.length) - 1];
    pushTrimmedPhrase(
      phrases,
      characters,
      firstWord.fromCharacterIndex,
      lastWord.toCharacterIndex
    );
  }

  return phrases;
}

function findWordBoundaries(characters: string[]): PhraseBoundary[] {
  const words: PhraseBoundary[] = [];
  let index = 0;

  while (index < characters.length) {
    while (index < characters.length && isWhitespace(characters[index])) {
      index += 1;
    }
    const wordStart = index;
    while (index < characters.length && !isWhitespace(characters[index])) {
      index += 1;
    }
    if (wordStart < index) {
      words.push({
        text: characters.slice(wordStart, index).join(""),
        fromCharacterIndex: wordStart,
        toCharacterIndex: index,
      });
    }
  }

  return words;
}

function pushTrimmedPhrase(
  phrases: PhraseBoundary[],
  characters: string[],
  fromCharacterIndex: number,
  toCharacterIndex: number
): void {
  let trimmedStart = fromCharacterIndex;
  let trimmedEnd = toCharacterIndex;

  while (trimmedStart < trimmedEnd && isWhitespace(characters[trimmedStart])) {
    trimmedStart += 1;
  }
  while (trimmedEnd > trimmedStart && isWhitespace(characters[trimmedEnd - 1])) {
    trimmedEnd -= 1;
  }

  if (trimmedStart >= trimmedEnd) return;

  phrases.push({
    text: characters.slice(trimmedStart, trimmedEnd).join(""),
    fromCharacterIndex: trimmedStart,
    toCharacterIndex: trimmedEnd,
  });
}

function isSentenceTerminator(character: string): boolean {
  return character === "." || character === "!" || character === "?";
}

function isClosingSentencePunctuation(character: string): boolean {
  return character === "\"" || character === "'" || character === ")" || character === "]" || character === "}";
}

function isWhitespace(character: string): boolean {
  return /\s/.test(character);
}
