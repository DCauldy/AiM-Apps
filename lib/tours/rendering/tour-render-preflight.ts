import { getProfileApiKeyStatusMap } from "@/lib/user-api-keys/server";
import { resolveProfileIdForRender } from "@/lib/profiles/resolve-for-render";
import type { HeyGenAvatarProjectPosition } from "@/lib/tours/avatar-project-settings";
import type { TourProjectType } from "../project-types";
import { getRequiredProviderKeysForTourType } from "../tour-type-availability";
import {
  createTourRenderRepository,
  type TourRenderPreflightProject,
  type TourRenderRepository,
} from "./tour-render.repository";
import type {
  HeyGenAvatarGenerationOptions,
  HeyGenAvatarPositioningInput,
  HeyGenAvatarSize,
} from "./tour-avatar";
import { mergeProjectAvatarSettingsIntoRenderOptions } from "./avatar-project-render-options";

export type TourRenderMode = "ken_burns_ffmpeg" | "provider_image_to_video";

export type TourRenderOptions = {
  renderMode?: TourRenderMode;
  reuseExistingAssets?: boolean;
  reuse?: {
    scriptPlan?: boolean;
    voiceover?: boolean;
    avatar?: boolean;
    sceneClips?: boolean;
    finalVideo?: boolean;
  };
  tourType?: TourProjectType;
  scriptPlanningModelId?: string;
  scriptPlanningFallbackDurationSeconds?: number;
  scriptPlanningMinDurationSeconds?: number;
  scriptPlanningMaxDurationSeconds?: number;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  elevenLabsVoiceSettings?: {
    stability?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  voiceoverTranscriptOptions?: {
    phraseMode?: "sentence" | "word-count";
    wordsPerPhrase?: number;
    useNormalizedAlignment?: boolean;
  };
  transitionDetectionModelId?: string;
  transitionMinimumDurationSeconds?: number;
  transitionDurationRoundingIncrementSeconds?: number;
  sceneClipProviderModelId?: string;
  sceneClipIncludeSecondarySourceImages?: boolean;
  sceneClipRenderSettings?: {
    width?: number;
    height?: number;
    fps?: number;
    crf?: number;
    fadeSeconds?: number;
    cropMode?: "cover" | "contain";
  };
  sceneClipConcurrencyLimit?: number;
  sceneTransitions?: {
    enabled?: boolean;
  };
  finalMuxSettings?: {
    width?: number;
    height?: number;
    videoCodec?: string;
    audioCodec?: string;
    preset?: string;
    crf?: number;
    audioBitrate?: string;
  };
  heyGenAvatarId?: string;
  heyGenAvatarProjectPlacement?: HeyGenAvatarProjectPosition;
  heyGenAvatarSize?: HeyGenAvatarSize;
  heyGenAvatarPositioning?: HeyGenAvatarPositioningInput;
  heyGenAvatarGeneration?: Partial<HeyGenAvatarGenerationOptions>;
};

export type TourRenderPreflightIssueCode =
  | "project_not_found"
  | "project_archived"
  | "no_included_scenes"
  | "missing_authoritative_source_photo"
  | "missing_elevenlabs_key"
  | "missing_elevenlabs_voice_id"
  | "missing_heygen_key"
  | "missing_heygen_avatar_id"
  | "missing_heygen_avatar_placement"
  | "unsupported_render_mode"
  | "listing_media_unreadable"
  | "provider_media_unreachable"
  | "generated_media_unwritable";

export type TourRenderPreflightIssue = {
  code: TourRenderPreflightIssueCode;
  message: string;
  severity: "blocking";
  sceneId?: string;
};

export type TourRenderPreflightSummary = {
  projectId: string;
  tourType: TourProjectType;
  renderMode: TourRenderMode;
  includedSceneCount: number;
  sourcePhotoCount: number;
  proofedFactCount: number;
  requiredProviderKeys: Array<"elevenlabs" | "heygen">;
};

export type TourRenderPreflightResult =
  | { ok: true; summary: TourRenderPreflightSummary }
  | { ok: false; issues: TourRenderPreflightIssue[] };

type ProviderKeyStatusMap = Partial<Record<"elevenlabs" | "heygen", boolean>>;

type PreflightTourRenderServiceOptions = {
  repository?: TourRenderRepository;
  fetcher?: typeof fetch;
  /** Profile-scoped key-status lookup. Defaults to reading from
   *  user_api_keys joined by profile_id. */
  getProviderKeyStatusMap?: (
    profileId: string,
    serviceKeys: readonly ("elevenlabs" | "heygen")[]
  ) => Promise<ProviderKeyStatusMap>;
  /** Override the project→profile_id resolver in tests. */
  resolveProfileId?: typeof resolveProfileIdForRender;
};

const DEFAULT_RENDER_MODE: TourRenderMode = "ken_burns_ffmpeg";
const TOUR_RENDER_MODES = new Set<TourRenderMode>([
  "ken_burns_ffmpeg",
  "provider_image_to_video",
]);

export function isTourRenderMode(value: unknown): value is TourRenderMode {
  return typeof value === "string" && TOUR_RENDER_MODES.has(value as TourRenderMode);
}

export function getDefaultTourRenderMode(): TourRenderMode {
  const configuredMode = process.env.TOURS_RENDER_MODE?.trim();
  return isTourRenderMode(configuredMode) ? configuredMode : DEFAULT_RENDER_MODE;
}

function issue(
  code: TourRenderPreflightIssueCode,
  message: string,
  sceneId?: string
): TourRenderPreflightIssue {
  return {
    code,
    message,
    severity: "blocking",
    ...(sceneId ? { sceneId } : {}),
  };
}

function summarizePreflightProject(
  project: TourRenderPreflightProject,
  options: TourRenderOptions,
  requiredProviderKeys: Array<"elevenlabs" | "heygen">
): TourRenderPreflightSummary {
  const includedScenes = project.scenes.filter((scene) => scene.included);

  return {
    projectId: project.project.id,
    tourType: project.project.tourType,
    renderMode: options.renderMode ?? getDefaultTourRenderMode(),
    includedSceneCount: includedScenes.length,
    sourcePhotoCount: includedScenes.filter((scene) => scene.authoritativePhoto).length,
    proofedFactCount: includedScenes.reduce((count, scene) => count + scene.proofedFacts.length, 0),
    requiredProviderKeys,
  };
}

export async function preflightTourRender(
  input: {
    projectId: string;
    userId: string;
    options?: TourRenderOptions;
  },
  serviceOptions: PreflightTourRenderServiceOptions = {}
): Promise<TourRenderPreflightResult> {
  const repository = serviceOptions.repository ?? (await createTourRenderRepository());
  const fetcher = serviceOptions.fetcher ?? fetch;
  const getStatusMap = serviceOptions.getProviderKeyStatusMap ?? getProfileApiKeyStatusMap;
  const resolveProfileId =
    serviceOptions.resolveProfileId ?? resolveProfileIdForRender;
  let options = input.options ?? {};
  const issues: TourRenderPreflightIssue[] = [];

  const project = await repository.getTourRenderPreflightProject({
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!project) {
    return {
      ok: false,
      issues: [
        issue(
          "project_not_found",
          "Tour Project was not found or is not available to this account."
        ),
      ],
    };
  }

  options = mergeProjectAvatarSettingsIntoRenderOptions({
    options,
    project: project.project,
  });

  if (options.renderMode !== undefined && !isTourRenderMode(options.renderMode)) {
    issues.push(
      issue(
        "unsupported_render_mode",
        "Tour render mode must be ken_burns_ffmpeg or provider_image_to_video."
      )
    );
  }

  if (project.project.status !== "open") {
    issues.push(
      issue("project_archived", "Archived Tour Projects cannot be rendered.")
    );
  }

  const includedScenes = project.scenes.filter((scene) => scene.included);
  if (includedScenes.length === 0) {
    issues.push(
      issue("no_included_scenes", "Include at least one scene before rendering.")
    );
  }

  for (const scene of includedScenes) {
    if (!scene.authoritativePhoto) {
      issues.push(
        issue(
          "missing_authoritative_source_photo",
          "Every included scene needs an authoritative source photo before rendering.",
          scene.id
        )
      );
    }
  }

  const requiredProviderKeys = getRequiredProviderKeysForTourType(project.project.tourType);
  if (requiredProviderKeys.length > 0) {
    // Resolve the profile that owns the API keys for this render. Falls
    // back to the user's default profile when the project predates the
    // profile_id column. Null only if the user has no profile at all —
    // then every required key is reported missing.
    const profileId = await resolveProfileId(input.projectId, input.userId);
    const keyStatus = profileId
      ? await getStatusMap(profileId, requiredProviderKeys)
      : ({} as ProviderKeyStatusMap);

    if (project.project.tourType === "tour_video_voice_over" && keyStatus.elevenlabs !== true) {
      issues.push(
        issue(
          "missing_elevenlabs_key",
          "Add an ElevenLabs API key before rendering a voice-over tour."
        )
      );
    }

    if (project.project.tourType === "tour_video_avatar" && keyStatus.elevenlabs !== true) {
      issues.push(
        issue(
          "missing_elevenlabs_key",
          "Add an ElevenLabs API key before rendering an avatar tour."
        )
      );
    }

    if (project.project.tourType === "tour_video_avatar" && keyStatus.heygen !== true) {
      issues.push(
        issue("missing_heygen_key", "Add a HeyGen API key before rendering an avatar tour.")
      );
    }
  }

  if (
    needsVoiceover(project.project.tourType) &&
    !(options.elevenLabsVoiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "").trim()
  ) {
    issues.push(
      issue(
        "missing_elevenlabs_voice_id",
        "Configure an ElevenLabs voice id before rendering a voice-over tour."
      )
    );
  }

  if (project.project.tourType === "tour_video_avatar") {
    if (!(options.heyGenAvatarId ?? process.env.HEYGEN_AVATAR_ID ?? "").trim()) {
      issues.push(
        issue(
          "missing_heygen_avatar_id",
          "Configure a HeyGen avatar id before rendering an avatar tour."
        )
      );
    }

    if (!options.heyGenAvatarPositioning) {
      issues.push(
        issue(
          "missing_heygen_avatar_placement",
          "Configure HeyGen avatar placement before rendering an avatar tour."
        )
      );
    }
  }

  const readableSourcePaths = includedScenes
    .map((scene) => scene.authoritativePhoto?.storagePath)
    .filter((storagePath): storagePath is string => Boolean(storagePath));

  if (
    readableSourcePaths.length > 0 &&
    !(await repository.canReadListingMedia({ storagePaths: readableSourcePaths }))
  ) {
    issues.push(
      issue(
        "listing_media_unreadable",
        "Listing source media could not be read. Re-upload the scene photos and try again."
      )
    );
  }

  if (
    readableSourcePaths.length > 0 &&
    process.env.PROVIDER_VISIBLE_SUPABASE_URL?.trim() &&
    !(await canReachProviderSignedUrl(repository, readableSourcePaths[0], fetcher))
  ) {
    issues.push(
      issue(
        "provider_media_unreachable",
        "Provider media URL is not reachable. Check the local tunnel and try again."
      )
    );
  }

  if (!(await repository.canWriteGeneratedMedia({ userId: input.userId, projectId: input.projectId }))) {
    issues.push(
      issue(
        "generated_media_unwritable",
        "Generated media storage is not writable. Try again after storage is available."
      )
    );
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    summary: summarizePreflightProject(project, options, requiredProviderKeys),
  };
}

function needsVoiceover(tourType: TourProjectType): boolean {
  return tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
}

async function canReachProviderSignedUrl(
  repository: TourRenderRepository,
  storagePath: string,
  fetcher: typeof fetch
): Promise<boolean> {
  const [signed] = await repository.createSignedSourcePhotoUrls({
    storagePaths: [storagePath],
    expiresInSeconds: 60,
  });
  if (!signed?.signedUrl) {
    return false;
  }

  try {
    const response = await fetcher(signed.signedUrl, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}
