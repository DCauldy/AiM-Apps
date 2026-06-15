import type { FinalRenderAvatarOverlay } from "./tour-final-render";
import type {
  TourRenderOptions,
  TourRenderPreflightIssue,
  TourRenderPreflightResult,
} from "./tour-render-preflight";
import type { RenderableTourProject, TourRenderAsset } from "./tour-render.repository";
import { TourSceneClipRenderError } from "./tour-scene-clips";
import { TourScriptPlanningError, type TourScriptPlan } from "./tour-script-planning";
import { type SceneDuration, TourTransitionDetectionError } from "./tour-transitions";
import { TourVoiceoverError } from "./tour-voiceover";
import { TourFinalRenderError } from "./tour-final-render";
import { TourAvatarError } from "./tour-avatar";
import type {
  TourAvatarBatchItem,
  TourAvatarBatchResult,
} from "./generate-tour-project-video.types";

export function safeErrorMessage(_error: unknown): string {
  if (_error instanceof TourScriptPlanningError) {
    if (_error.code === "PROVIDER_RESPONSE_INVALID") {
      return _error.message;
    }
    if (_error.code === "SIGNED_IMAGE_URL_MISSING") {
      return "Source photo URLs could not be signed for script planning.";
    }
    if (_error.code === "SCRIPT_PLAN_UPLOAD_FAILED") {
      return "Script plan upload failed.";
    }
    if (_error.code === "SCRIPT_PLAN_ASSET_CREATE_FAILED") {
      return "Script plan asset could not be recorded.";
    }
    return "Script planning failed.";
  }
  if (_error instanceof TourTransitionDetectionError) {
    if (_error.code === "PROVIDER_RESPONSE_INVALID") {
      return "Scene transition detection returned an invalid response.";
    }
    if (_error.code === "TRANSITION_TIMING_INVALID" || _error.code === "TRANSCRIPT_INVALID") {
      return "Scene transition timing could not be validated.";
    }
  }
  if (_error instanceof TourVoiceoverError) {
    if (_error.code === "MISSING_ELEVENLABS_API_KEY") {
      return "ElevenLabs API key is not configured for voiceover generation.";
    }
    if (_error.code === "MISSING_ELEVENLABS_VOICE_ID") {
      return "ElevenLabs voice id is not configured for voiceover generation.";
    }
    if (_error.code === "ELEVENLABS_TTS_FAILED") {
      return "ElevenLabs voiceover generation failed.";
    }
    if (_error.code === "ELEVENLABS_TTS_RESPONSE_INVALID") {
      return "ElevenLabs voiceover response was invalid.";
    }
    if (
      _error.code === "VOICEOVER_AUDIO_UPLOAD_FAILED" ||
      _error.code === "VOICEOVER_TRANSCRIPT_UPLOAD_FAILED" ||
      _error.code === "VOICEOVER_AUDIO_ASSET_CREATE_FAILED" ||
      _error.code === "VOICEOVER_TRANSCRIPT_ASSET_CREATE_FAILED"
    ) {
      return "Voiceover assets could not be persisted.";
    }
    if (_error.code === "TRANSCRIPT_ALIGNMENT_FAILED") {
      return "Voiceover transcript timing could not be aligned.";
    }
    return "Voiceover generation failed.";
  }
  if (_error instanceof TourSceneClipRenderError) {
    if (_error.code === "SCENE_CLIP_UPLOAD_FAILED") {
      return "Scene clip upload failed.";
    }
    if (_error.code === "SCENE_CLIP_ASSET_CREATE_FAILED") {
      return "Scene clip asset could not be recorded.";
    }
    return "Scene clip rendering failed.";
  }
  if (_error instanceof TourFinalRenderError) {
    if (_error.code === "CONCAT_FAILED") {
      return "Scene clips could not be joined.";
    }
    if (_error.code === "MUX_FAILED") {
      return "Final video mux failed.";
    }
    if (_error.code === "JOINED_SCENES_UPLOAD_FAILED") {
      return "Joined scene video upload failed.";
    }
    if (_error.code === "FINAL_VIDEO_UPLOAD_FAILED") {
      return "Final video upload failed.";
    }
    if (_error.code === "JOINED_SCENES_ASSET_CREATE_FAILED") {
      return "Joined scene video asset could not be recorded.";
    }
    if (_error.code === "FINAL_VIDEO_ASSET_CREATE_FAILED") {
      return "Final video asset could not be recorded.";
    }
    return "Final video rendering failed.";
  }
  if (_error instanceof TourAvatarError) {
    if (_error.code === "MISSING_HEYGEN_API_KEY") {
      return "HeyGen API key is not configured for avatar rendering.";
    }
    if (_error.code === "MISSING_HEYGEN_AVATAR_ID") {
      return "HeyGen avatar id is not configured for avatar rendering.";
    }
    if (
      _error.code === "AVATAR_VIDEO_UPLOAD_FAILED" ||
      _error.code === "AVATAR_METADATA_UPLOAD_FAILED" ||
      _error.code === "AVATAR_VIDEO_ASSET_CREATE_FAILED" ||
      _error.code === "AVATAR_METADATA_ASSET_CREATE_FAILED"
    ) {
      return "Avatar render assets could not be persisted.";
    }
    return "Avatar rendering failed.";
  }

  return "Tour render failed before rendering could complete.";
}

export function summarizePreflightFailure(
  preflight: Extract<TourRenderPreflightResult, { ok: false }>
): string {
  const firstIssue: TourRenderPreflightIssue | undefined = preflight.issues[0];
  return firstIssue?.message ?? "Tour project is not ready for rendering.";
}

export function needsVoiceover(tourType: string): boolean {
  return tourType === "tour_video_voice_over" || tourType === "tour_video_avatar";
}

export function needsAvatar(tourType: string): boolean {
  return tourType === "tour_video_avatar";
}

export function shouldReuseAsset(
  options: TourRenderOptions | undefined,
  asset: "scriptPlan" | "voiceover" | "avatar" | "sceneClips" | "finalVideo"
): boolean {
  if (typeof options?.reuse?.[asset] === "boolean") {
    return options.reuse[asset];
  }
  return options?.reuseExistingAssets !== false;
}

export function scriptTimingsToDurations(scriptPlan: {
  sceneTimings: Array<{ sceneId: string; scriptText: string; durationSeconds: number }>;
}): SceneDuration[] {
  let offsetMs = 0;
  return scriptPlan.sceneTimings.map((timing) => {
    const durationMs = Math.max(0, Math.round(timing.durationSeconds * 1000));
    const duration: SceneDuration = {
      sceneId: timing.sceneId,
      title: timing.sceneId,
      durationSeconds: timing.durationSeconds,
      offsets: {
        from: offsetMs,
        to: offsetMs + durationMs,
      },
    };
    offsetMs += durationMs;
    return duration;
  });
}

export function applyScriptPlannedCameraMotions(
  project: RenderableTourProject,
  scriptPlan: TourScriptPlan
): RenderableTourProject {
  const selectedMotionBySceneId = new Map(
    scriptPlan.sceneTimings
      .filter((timing) => timing.selectedCameraMotion)
      .map((timing) => [timing.sceneId, timing.selectedCameraMotion!])
  );

  return {
    ...project,
    scenes: project.scenes.map((scene) => {
      if (scene.cameraMotion !== "auto") {
        return scene;
      }

      const selectedCameraMotion = selectedMotionBySceneId.get(scene.id);
      return selectedCameraMotion
        ? {
            ...scene,
            cameraMotion: selectedCameraMotion,
          }
        : scene;
    }),
  };
}

export function summarizeSceneCameraMotions(project: RenderableTourProject): Array<{
  sceneId: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: string;
}> {
  return project.scenes
    .map((scene) => ({
      sceneId: scene.id,
      title: scene.title,
      sortOrder: scene.sortOrder,
      included: scene.included,
      cameraMotion: scene.cameraMotion,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sceneId.localeCompare(b.sceneId));
}

export function buildAvatarBatchItem(input: {
  projectId: string;
  runId: string;
  userId: string;
  profileId: string;
  projectName: string;
  signedVoiceoverAudioUrl: string;
  voiceoverAudioAsset: TourRenderAsset;
  options?: TourRenderOptions;
}): TourAvatarBatchItem {
  return {
    projectId: input.projectId,
    runId: input.runId,
    userId: input.userId,
    profileId: input.profileId,
    projectName: input.projectName,
    signedVoiceoverAudioUrl: input.signedVoiceoverAudioUrl,
    voiceoverAudioAsset: input.voiceoverAudioAsset,
    options: {
      reuseExistingAssets: shouldReuseAsset(input.options, "avatar"),
      avatarId: input.options?.heyGenAvatarId,
      size: input.options?.heyGenAvatarSize,
      positioning: input.options?.heyGenAvatarPositioning,
      generation: input.options?.heyGenAvatarGeneration,
    },
  };
}

export function resolveAvatarOverlay(input: TourAvatarBatchResult): {
  avatarAssetIds: { avatarVideoAssetId: string; avatarMetadataAssetId: string };
  avatarOverlay: FinalRenderAvatarOverlay;
} | null {
  if (!input.metadata) {
    return null;
  }

  return {
    avatarAssetIds: {
      avatarVideoAssetId: input.avatarAsset.id,
      avatarMetadataAssetId: input.metadataAsset.id,
    },
    avatarOverlay: {
      avatarAsset: input.avatarAsset,
      metadataAsset: input.metadataAsset,
      metadata: input.metadata,
    },
  };
}

export function isProviderReachableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
