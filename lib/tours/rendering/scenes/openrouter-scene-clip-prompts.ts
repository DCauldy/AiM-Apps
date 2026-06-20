import {
  getTourSceneCameraMotionLabel,
  type TourSceneCameraMotion,
} from "@/lib/tours/scenes.core";

export type OpenRouterSceneClipPromptInput = {
  scene: {
    title: string;
    cameraMotion: TourSceneCameraMotion;
  };
  secondarySourceImageUrls: string[];
};

export function buildOpenRouterSceneClipPrompt(
  input: OpenRouterSceneClipPromptInput
): string {
  const cameraMotion =
    input.scene.cameraMotion === "auto"
      ? "Choose the strongest camera motion for an Instagram real-estate hook based on the primary first-frame image"
      : getTourSceneCameraMotionLabel(input.scene.cameraMotion);
  const hasSecondaryReferences = input.secondarySourceImageUrls.length > 0;
  const secondaryReferenceInstruction = hasSecondaryReferences
    ? [
        "Secondary reference images are provided only as additional room/property context for more dynamic but truthful camera motion.",
        "Use them to understand adjacent details, depth, materials, and spatial continuity, but keep the generated clip anchored to the primary first-frame image.",
      ].join(" ")
    : null;

  return [
    cameraMotion,
    `through ${input.scene.title}.`,
    secondaryReferenceInstruction,
    "Preserve all visible property details exactly.",
    "Do not invent or borrow objects, rooms, fixtures, doors, windows, openings, light sources, or architectural details from secondary references unless they are consistent with the primary first-frame image.",
    "Do not add or remove rooms, fixtures, doors, windows, openings, light sources, or architectural details.",
  ].filter(Boolean).join(" ");
}
