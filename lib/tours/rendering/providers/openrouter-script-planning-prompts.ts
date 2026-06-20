import {
  RESOLVED_TOUR_SCENE_CAMERA_MOTIONS,
  TOUR_SCENE_CAMERA_MOTION_LABELS,
  type TourSceneCameraMotion,
} from "@/lib/tours/scenes.core";
import type { TourProjectType } from "@/lib/tours/project-types";

export const DEFAULT_TOUR_SCRIPT_PLANNING_MODEL = "google/gemini-2.5-flash";
export const TOUR_SCRIPT_PLANNING_PROMPT_VERSION =
  "tour-script-plan-v2-elevenlabs-v3-tags";

export type TourScriptPlanningPromptInput = {
  project: {
    id: string;
    name: string;
    propertyAddress: string;
    listingUrl: string | null;
    tourType: TourProjectType | string;
  };
  scenes: Array<{
    id: string;
    title: string;
    cameraMotion: TourSceneCameraMotion;
    proofedFacts: Array<{
      text: string;
    }>;
  }>;
  promptVersion: string;
  timing: {
    fallbackDurationSeconds: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
};

export function buildOpenRouterScriptPlanSystemPrompt(): string {
  return [
    "You write concise spoken real-estate tour narration for ElevenLabs v3.",
    "Return only valid JSON.",
    "Use every supplied scene exactly once and keep the scene IDs unchanged.",
    "Each scene needs clean spokenText plus voicePromptText with sparse ElevenLabs v3 bracket tags.",
    "Keep user-supplied facts unchanged in meaning, but make the spoken wording polished.",
    "Do not say phrases like 'the tour moves into', 'next standout', 'start here', 'this scene', 'in this shot', or 'as we enter'.",
    "Do not create an image-to-video prompt.",
  ].join(" ");
}

export function buildOpenRouterScriptPlanPrompt(
  input: TourScriptPlanningPromptInput
): string {
  return [
    "Create a scene-ordered tour script plan for a photo-based real-estate tour.",
    `Return JSON shape: {"fullScript":"clean spoken narration only","voicePromptScript":"ElevenLabs v3 prompt text","sceneTimings":[{"sceneId":"...","spokenText":"...","voicePromptText":"[tag] ...","deliveryTags":["[tag]"],"selectedCameraMotion":"slow_push","durationSeconds":${input.timing.fallbackDurationSeconds}}]}.`,
    `durationSeconds must be between ${input.timing.minDurationSeconds} and ${input.timing.maxDurationSeconds}.`,
    `Prompt version: ${input.promptVersion}.`,
    "The final renderer will use each still image with camera motion, so write narration that works over a photo-based tour.",
    "Write buyer-facing narration only. Do not describe the tour mechanics or camera movement.",
    "Keep each scene to 1-2 short spoken sentences.",
    `Available concrete camera motions: ${formatResolvedCameraMotionOptions()}.`,
    "If a scene's cameraMotion is auto, inspect its image and set selectedCameraMotion to the best concrete motion for an Instagram real-estate hook.",
    "If a scene's cameraMotion is not auto, set selectedCameraMotion to that supplied concrete value.",
    "Choose motion based on composition: strong centered feature can use slow_push or snap_push, wide rooms can use slow_pan or hero_reveal, finishes can use detail_glide, tall foyers/stairs/windows/facades can use vertical_rise, and already-perfect compositions can use static_hold.",
    "",
    "ElevenLabs v3 delivery tags:",
    "- Add one short square-bracket tag at the start of each scene's voicePromptText.",
    "- Tags guide delivery; they are not spoken words.",
    "- Use richer but credible tags like [bright, confident real estate host], [with quiet excitement], [with a warm smile], [with subtle emphasis], [slower, premium, reassuring], [softly impressed], [light laugh, impressed], or [with confident warmth].",
    "- Prefer the energy of [bright, confident real estate host] and [with quiet excitement] over flat narration.",
    "- Avoid fake-sounding laughter, extreme excitement, XML tags, SSML, headings, labels, and prose instructions outside brackets.",
    "- voicePromptText must be spokenText with only delivery tags added; do not add facts or extra narration there.",
    "- fullScript must contain clean spoken words without bracket tags.",
    "- voicePromptScript must contain the tagged voicePromptText values joined in scene order.",
    "Do not include markdown, comments, labels, or text outside the JSON object.",
    "",
    "Property:",
    JSON.stringify(
      {
        id: input.project.id,
        name: input.project.name,
        propertyAddress: input.project.propertyAddress,
        listingUrl: input.project.listingUrl,
        tourType: input.project.tourType,
      },
      null,
      2
    ),
    "",
    "Scenes:",
    ...input.scenes.map((scene, index) => {
      const facts = scene.proofedFacts.length
        ? scene.proofedFacts.map((fact) => fact.text).join("; ")
        : "None";
      return [
        `${index + 1}. sceneId: ${scene.id}`,
        `title: ${scene.title}`,
        `cameraMotion: ${scene.cameraMotion}`,
        `facts: ${facts}`,
      ].join("\n");
    }),
  ].join("\n");
}

function formatResolvedCameraMotionOptions(): string {
  return RESOLVED_TOUR_SCENE_CAMERA_MOTIONS.map(
    (motion) => `${motion} (${TOUR_SCENE_CAMERA_MOTION_LABELS[motion]})`
  ).join(", ");
}
