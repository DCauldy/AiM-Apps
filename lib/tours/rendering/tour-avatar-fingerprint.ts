import { createHash } from "node:crypto";
import type { TourRenderAsset } from "./tour-render.repository";
import {
  HEYGEN_AVATAR_PROVIDER_VERSION,
  type HeyGenAvatarFingerprint,
  type HeyGenAvatarGenerationOptions,
  type HeyGenAvatarResolvedPositioning,
  type HeyGenAvatarSize,
  type HeyGenAvatarSource,
  type HeyGenAvatarVideoFingerprint,
  type VideoCanvas,
} from "./tour-avatar.types";

export function buildHeyGenAvatarFingerprint(input: {
  source: HeyGenAvatarSource;
  voiceoverAudioAsset?: Pick<TourRenderAsset, "id" | "fingerprintHash"> | null;
  existingAvatarAsset?: Pick<TourRenderAsset, "fingerprintHash"> | null;
  avatarId: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: HeyGenAvatarResolvedPositioning;
  generation: HeyGenAvatarGenerationOptions;
  sampleEverySeconds: number;
}): HeyGenAvatarFingerprint {
  return {
    kind: "avatar",
    version: 1,
    provider: "heygen",
    providerModuleVersion: HEYGEN_AVATAR_PROVIDER_VERSION,
    avatarId: input.source.mode === "generate" ? input.avatarId : null,
    source: {
      mode: input.source.mode,
      voiceoverAudioAssetId: input.voiceoverAudioAsset?.id ?? null,
      voiceoverAudioFingerprintHash: input.voiceoverAudioAsset?.fingerprintHash ?? null,
      existingAvatarFingerprintHash: input.existingAvatarAsset?.fingerprintHash ?? null,
    },
    generation: input.source.mode === "generate" ? input.generation : null,
    canvas: input.canvas,
    size: input.size,
    positioning: input.positioning,
    sampleEverySeconds: input.sampleEverySeconds,
  };
}

export function buildHeyGenAvatarVideoFingerprint(input: {
  source: HeyGenAvatarSource;
  voiceoverAudioAsset?: Pick<TourRenderAsset, "id" | "fingerprintHash"> | null;
  existingAvatarAsset?: Pick<TourRenderAsset, "fingerprintHash"> | null;
  avatarId: string;
  generation: HeyGenAvatarGenerationOptions;
}): HeyGenAvatarVideoFingerprint {
  return {
    kind: "avatar_video",
    version: 1,
    provider: "heygen",
    providerModuleVersion: HEYGEN_AVATAR_PROVIDER_VERSION,
    avatarId: input.source.mode === "generate" ? input.avatarId : null,
    source: {
      mode: input.source.mode,
      voiceoverAudioAssetId: input.voiceoverAudioAsset?.id ?? null,
      voiceoverAudioFingerprintHash: input.voiceoverAudioAsset?.fingerprintHash ?? null,
      existingAvatarFingerprintHash: input.existingAvatarAsset?.fingerprintHash ?? null,
    },
    generation: input.source.mode === "generate" ? input.generation : null,
  };
}

export function hashHeyGenAvatarFingerprint(fingerprint: HeyGenAvatarFingerprint): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export function hashHeyGenAvatarVideoFingerprint(fingerprint: HeyGenAvatarVideoFingerprint): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}
