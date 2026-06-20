import { createHash } from "node:crypto";
import type {
  RenderableTourProject,
  RenderableTourScene,
  TourRenderAsset,
  TourRenderRepository,
} from "./tour-render.repository";
import {
  RESOLVED_TOUR_SCENE_CAMERA_MOTIONS,
  type ResolvedTourSceneCameraMotion,
} from "@/lib/tours/scenes.core";
import {
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
} from "./openrouter-script-planning-prompts";

export {
  DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
  TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
} from "./openrouter-script-planning-prompts";

export type TourScriptSceneTiming = {
  sceneId: string;
  spokenText?: string;
  voicePromptText?: string;
  deliveryTags?: string[];
  selectedCameraMotion?: ResolvedTourSceneCameraMotion;
  /** @deprecated Use spokenText for clean narration and voicePromptText for ElevenLabs v3. */
  scriptText: string;
  durationSeconds: number;
};

export type TourScriptPlan = {
  fullScript: string;
  voicePromptScript?: string;
  sceneTimings: TourScriptSceneTiming[];
  model: string;
  usage?: unknown;
};

export type TourScriptTimingOptions = {
  fallbackDurationSeconds?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};

export type TourScriptPlanningOptions = TourScriptTimingOptions & {
  modelId?: string;
  reuseExistingAssets?: boolean;
};

export type TourScriptPlanningSceneInput = {
  id: string;
  title: string;
  sortOrder: number;
  cameraMotion: RenderableTourScene["cameraMotion"];
  imageUrl: string;
  proofedFacts: Array<{
    id: string;
    text: string;
    sortOrder: number;
    sourcePhotoId: string | null;
  }>;
};

export type TourScriptPlanningProviderInput = {
  project: RenderableTourProject["project"];
  scenes: TourScriptPlanningSceneInput[];
  modelId: string;
  promptVersion: string;
  timing: Required<TourScriptTimingOptions>;
};

export type TourScriptPlanningProvider = {
  planScript(input: TourScriptPlanningProviderInput): Promise<TourScriptPlan>;
};

export type TourScriptPlanningResult =
  | {
      reused: true;
      asset: TourRenderAsset;
      plan: TourScriptPlan;
      fingerprintHash: string;
      fingerprint: TourScriptPlanFingerprint;
    }
  | {
      reused: false;
      asset: TourRenderAsset;
      plan: TourScriptPlan;
      fingerprintHash: string;
      fingerprint: TourScriptPlanFingerprint;
    };

export type TourScriptPlanFingerprint = {
  kind: "script_plan";
  version: 1;
  promptVersion: string;
  modelId: string;
  timing: Required<TourScriptTimingOptions>;
  project: {
    id: string;
    name: string;
    propertyAddress: string;
    listingUrl: string | null;
    tourType: string;
  };
  scenes: Array<{
    id: string;
    sortOrder: number;
    title: string;
    cameraMotion: RenderableTourScene["cameraMotion"];
    authoritativePhoto: {
      id: string;
      storagePath: string;
      fileName: string;
      contentType: string;
      byteSize: number;
      width: number | null;
      height: number | null;
    };
    proofedFacts: Array<{
      id: string;
      text: string;
      sortOrder: number;
      sourcePhotoId: string | null;
    }>;
  }>;
};

export class TourScriptPlanningError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROJECT_HAS_NO_INCLUDED_SCENES"
      | "SIGNED_IMAGE_URL_MISSING"
      | "PROVIDER_RESPONSE_INVALID"
      | "SCRIPT_PLAN_UPLOAD_FAILED"
      | "SCRIPT_PLAN_ASSET_CREATE_FAILED"
  ) {
    super(message);
    this.name = "TourScriptPlanningError";
  }
}

const DEFAULT_TIMING_OPTIONS: Required<TourScriptTimingOptions> = {
  fallbackDurationSeconds: 5,
  minDurationSeconds: 3,
  maxDurationSeconds: 9,
};

export function resolveScriptPlanningOptions(
  options: TourScriptPlanningOptions = {}
): {
  modelId: string;
  reuseExistingAssets: boolean;
  timing: Required<TourScriptTimingOptions>;
} {
  return {
    modelId: options.modelId ?? DEFAULT_TOUR_SCRIPT_PLANNING_MODEL,
    reuseExistingAssets: options.reuseExistingAssets !== false,
    timing: {
      fallbackDurationSeconds:
        options.fallbackDurationSeconds ?? DEFAULT_TIMING_OPTIONS.fallbackDurationSeconds,
      minDurationSeconds: options.minDurationSeconds ?? DEFAULT_TIMING_OPTIONS.minDurationSeconds,
      maxDurationSeconds: options.maxDurationSeconds ?? DEFAULT_TIMING_OPTIONS.maxDurationSeconds,
    },
  };
}

export function buildTourScriptPlanFingerprint(input: {
  project: RenderableTourProject;
  modelId: string;
  promptVersion?: string;
  timing: Required<TourScriptTimingOptions>;
}): TourScriptPlanFingerprint {
  const includedScenes = includedRenderableScenes(input.project);

  return {
    kind: "script_plan",
    version: 1,
    promptVersion: input.promptVersion ?? TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
    modelId: input.modelId,
    timing: input.timing,
    project: {
      id: input.project.project.id,
      name: input.project.project.name,
      propertyAddress: input.project.project.propertyAddress,
      listingUrl: input.project.project.listingUrl,
      tourType: input.project.project.tourType,
    },
    scenes: includedScenes.map((scene) => ({
      id: scene.id,
      sortOrder: scene.sortOrder,
      title: scene.title,
      cameraMotion: scene.cameraMotion,
      authoritativePhoto: {
        id: scene.authoritativePhoto.id,
        storagePath: scene.authoritativePhoto.storagePath,
        fileName: scene.authoritativePhoto.fileName,
        contentType: scene.authoritativePhoto.contentType,
        byteSize: scene.authoritativePhoto.byteSize,
        width: scene.authoritativePhoto.width,
        height: scene.authoritativePhoto.height,
      },
      proofedFacts: scene.proofedFacts.map((fact) => ({
        id: fact.id,
        text: fact.text,
        sortOrder: fact.sortOrder,
        sourcePhotoId: fact.sourcePhotoId,
      })),
    })),
  };
}

export function hashTourScriptPlanFingerprint(fingerprint: TourScriptPlanFingerprint): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export function normalizeTourScriptPlan(input: {
  parsed: Partial<TourScriptPlan>;
  scenes: TourScriptPlanningSceneInput[];
  modelId: string;
  usage?: unknown;
  timing: Required<TourScriptTimingOptions>;
}): TourScriptPlan {
  if (!Array.isArray(input.parsed.sceneTimings)) {
    throw new TourScriptPlanningError(
      "Script plan missing sceneTimings array.",
      "PROVIDER_RESPONSE_INVALID"
    );
  }

  const bySceneId = new Map(input.parsed.sceneTimings.map((timing) => [timing.sceneId, timing]));
  const sceneTimings = input.scenes.map((scene) => {
    const timing = bySceneId.get(scene.id);
    const spokenText = normalizeSpokenText(timing);
    if (!spokenText) {
      throw new TourScriptPlanningError(
        `Script plan missing spoken narration for scene "${scene.title}" (${scene.id}).`,
        "PROVIDER_RESPONSE_INVALID"
      );
    }
    const deliveryTags = normalizeDeliveryTags(timing?.deliveryTags);
    const voicePromptText = normalizeVoicePromptText(timing, spokenText, deliveryTags);
    const selectedCameraMotion = normalizeSelectedCameraMotion(timing, scene);

    return {
      sceneId: scene.id,
      spokenText,
      voicePromptText,
      deliveryTags,
      selectedCameraMotion,
      scriptText: spokenText,
      durationSeconds: clampDuration(
        timing?.durationSeconds,
        input.timing.fallbackDurationSeconds,
        input.timing.minDurationSeconds,
        input.timing.maxDurationSeconds
      ),
    };
  });

  return {
    fullScript: sceneTimings.map((timing) => timing.spokenText).join(" "),
    voicePromptScript: sceneTimings.map((timing) => timing.voicePromptText).join("\n\n"),
    sceneTimings,
    model: input.modelId,
    usage: input.usage,
  };
}

export async function planTourScriptStage(input: {
  project: RenderableTourProject;
  repository: TourRenderRepository;
  runId: string;
  userId: string;
  provider: TourScriptPlanningProvider;
  options?: TourScriptPlanningOptions;
}): Promise<TourScriptPlanningResult> {
  const resolvedOptions = resolveScriptPlanningOptions(input.options);
  const includedScenes = includedRenderableScenes(input.project);
  if (includedScenes.length === 0) {
    throw new TourScriptPlanningError(
      "Tour render needs at least one included scene for script planning.",
      "PROJECT_HAS_NO_INCLUDED_SCENES"
    );
  }

  const fingerprint = buildTourScriptPlanFingerprint({
    project: input.project,
    modelId: resolvedOptions.modelId,
    timing: resolvedOptions.timing,
  });
  const fingerprintHash = hashTourScriptPlanFingerprint(fingerprint);

  if (resolvedOptions.reuseExistingAssets) {
    const reusableAsset = await input.repository.findReusableAsset({
      projectId: input.project.project.id,
      kind: "script_plan",
      fingerprintHash,
      sceneId: null,
    });

    if (reusableAsset) {
      const value =
        reusableAsset.storageBucket === "tours-generated-media" && reusableAsset.storagePath
          ? await input.repository.downloadRenderAssetJson({
              storageBucket: reusableAsset.storageBucket,
              storagePath: reusableAsset.storagePath,
            })
          : null;
      const plan = normalizeTourScriptPlan({
        parsed: isRecord(value) ? value : {},
        scenes: buildScriptPlanningSceneInputs(includedScenes, new Map()),
        modelId: resolvedOptions.modelId,
        usage: isRecord(value) ? value.usage : undefined,
        timing: resolvedOptions.timing,
      });

      await input.repository.recordRunAssetUsage({
        runId: input.runId,
        assetId: reusableAsset.id,
        usage: "reused",
      });
      return {
        reused: true,
        asset: reusableAsset,
        plan,
        fingerprintHash,
        fingerprint,
      };
    }
  }

  const signedUrls = await input.repository.createSignedSourcePhotoUrls({
    storagePaths: includedScenes.map((scene) => scene.authoritativePhoto.storagePath),
    expiresInSeconds: 5 * 60,
  });
  const signedUrlByStoragePath = new Map(
    signedUrls.map((signedUrl) => [signedUrl.storagePath, signedUrl.signedUrl])
  );
  const providerScenes = buildScriptPlanningSceneInputs(
    includedScenes,
    signedUrlByStoragePath
  );

  const plan = await input.provider.planScript({
    project: input.project.project,
    scenes: providerScenes,
    modelId: resolvedOptions.modelId,
    promptVersion: TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
    timing: resolvedOptions.timing,
  });
  const normalizedPlan = normalizeTourScriptPlan({
    parsed: plan,
    scenes: providerScenes,
    modelId: resolvedOptions.modelId,
    usage: plan.usage,
    timing: resolvedOptions.timing,
  });
  const upload = await input.repository.uploadRenderAssetJson({
    userId: input.userId,
    projectId: input.project.project.id,
    runId: input.runId,
    kind: "script_plan",
    value: normalizedPlan,
  });

  if (!upload) {
    throw new TourScriptPlanningError(
      "Could not upload script plan asset.",
      "SCRIPT_PLAN_UPLOAD_FAILED"
    );
  }

  const asset = await input.repository.createAsset({
    projectId: input.project.project.id,
    createdByRunId: input.runId,
    kind: "script_plan",
    storageBucket: upload.storageBucket,
    storagePath: upload.storagePath,
    contentType: upload.contentType,
    fingerprintHash,
    fingerprint,
    reusable: true,
    metadata: {
      model: normalizedPlan.model,
      promptVersion: TOUR_SCRIPT_PLANNING_PROMPT_VERSION,
      sceneCount: normalizedPlan.sceneTimings.length,
      usage: normalizedPlan.usage,
    },
  });

  if (!asset) {
    throw new TourScriptPlanningError(
      "Could not create script plan asset record.",
      "SCRIPT_PLAN_ASSET_CREATE_FAILED"
    );
  }

  await input.repository.recordRunAssetUsage({
    runId: input.runId,
    assetId: asset.id,
    usage: "created",
  });

  return {
    reused: false,
    asset,
    plan: normalizedPlan,
    fingerprintHash,
    fingerprint,
  };
}

function includedRenderableScenes(project: RenderableTourProject): RenderableTourScene[] {
  return project.scenes
    .filter((scene) => scene.included)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function buildScriptPlanningSceneInputs(
  includedScenes: RenderableTourScene[],
  signedUrlByStoragePath: Map<string, string>
): TourScriptPlanningSceneInput[] {
  return includedScenes.map((scene) => {
    const imageUrl = signedUrlByStoragePath.get(scene.authoritativePhoto.storagePath);
    if (!imageUrl && signedUrlByStoragePath.size > 0) {
      throw new TourScriptPlanningError(
        `Could not create a signed image URL for scene "${scene.title}".`,
        "SIGNED_IMAGE_URL_MISSING"
      );
    }

    return {
      id: scene.id,
      title: scene.title,
      sortOrder: scene.sortOrder,
      cameraMotion: scene.cameraMotion,
      imageUrl: imageUrl ?? "",
      proofedFacts: scene.proofedFacts.map((fact) => ({
        id: fact.id,
        text: fact.text,
        sortOrder: fact.sortOrder,
        sourcePhotoId: fact.sourcePhotoId,
      })),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeSpokenText(
  timing: Partial<TourScriptSceneTiming> | undefined
): string {
  const source = timing?.spokenText ?? timing?.scriptText;
  return typeof source === "string" ? source.trim() : "";
}

function normalizeVoicePromptText(
  timing: Partial<TourScriptSceneTiming> | undefined,
  spokenText: string,
  deliveryTags: string[]
): string {
  const source = timing?.voicePromptText;
  if (typeof source === "string" && source.trim()) {
    return source.trim();
  }
  return [deliveryTags[0], spokenText].filter(Boolean).join(" ");
}

function normalizeDeliveryTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => /^\[[^\]\n]{2,120}\]$/.test(tag))
    .slice(0, 2);
}

function normalizeSelectedCameraMotion(
  timing: Partial<TourScriptSceneTiming> | undefined,
  scene: TourScriptPlanningSceneInput
): ResolvedTourSceneCameraMotion | undefined {
  if (scene.cameraMotion !== "auto") {
    return undefined;
  }

  if (
    typeof timing?.selectedCameraMotion === "string" &&
    RESOLVED_TOUR_SCENE_CAMERA_MOTIONS.includes(timing.selectedCameraMotion)
  ) {
    return timing.selectedCameraMotion;
  }

  throw new TourScriptPlanningError(
    `Script plan missing selectedCameraMotion for auto camera motion scene "${scene.title}" (${scene.id}).`,
    "PROVIDER_RESPONSE_INVALID"
  );
}

function clampDuration(
  value: number | undefined,
  fallbackDurationSeconds: number,
  minDurationSeconds: number,
  maxDurationSeconds: number
): number {
  const duration =
    value !== undefined && Number.isFinite(value) ? value : fallbackDurationSeconds;
  return Math.max(
    minDurationSeconds,
    Math.min(maxDurationSeconds, Math.round(duration * 2) / 2)
  );
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
