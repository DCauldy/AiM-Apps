import type { HeyGenAvatarProjectPosition } from "@/lib/tours/avatar-project-settings";
import type { HeyGenAvatarPositioningInput } from "./tour-avatar";
import type { TourRenderOptions } from "../preflight/preflight";

export function normalizeProjectAvatarPosition(
  position: HeyGenAvatarProjectPosition
): HeyGenAvatarPositioningInput {
  const avatarWidth = position.frame.width - position.offsets.left - position.offsets.right;
  const avatarCenterX =
    position.offsets.left +
    avatarWidth / 2;
  const frameCenterX = position.frame.width / 2;

  if (avatarCenterX < frameCenterX) {
    return {
      anchor: "bottom-left",
      rightMargin: position.offsets.left,
      bottomMargin: position.offsets.bottom,
      basis: "videoLayer",
      avatarWidth,
      alphaThreshold: 16,
    };
  }

  return {
    anchor: "bottom-right",
    rightMargin: position.offsets.right,
    bottomMargin: position.offsets.bottom,
    basis: "videoLayer",
    avatarWidth,
    alphaThreshold: 16,
  };
}

export function mergeProjectAvatarSettingsIntoRenderOptions(input: {
  options: TourRenderOptions;
  project: {
    heyGenAvatarId?: string | null;
    heyGenAvatarPlacement?: HeyGenAvatarProjectPosition | null;
  };
}): TourRenderOptions {
  const projectAvatarId = input.project.heyGenAvatarId?.trim();
  const projectPlacement = input.project.heyGenAvatarPlacement;
  const effectivePlacement = input.options.heyGenAvatarProjectPlacement ?? projectPlacement;

  return {
    ...input.options,
    ...(input.options.heyGenAvatarId || !projectAvatarId
      ? {}
      : { heyGenAvatarId: projectAvatarId }),
    ...(input.options.heyGenAvatarPositioning || !effectivePlacement
      ? {}
      : { heyGenAvatarPositioning: normalizeProjectAvatarPosition(effectivePlacement) }),
    ...(input.options.heyGenAvatarProjectPlacement || !projectPlacement
      ? {}
      : { heyGenAvatarProjectPlacement: projectPlacement }),
  };
}
