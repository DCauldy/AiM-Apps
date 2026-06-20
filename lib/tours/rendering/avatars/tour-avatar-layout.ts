import { formatNumber } from "./tour-avatar-format";
import {
  HEYGEN_AVATAR_SIZE_PRESETS,
  TourAvatarError,
  type HeyGenAvatarAlphaAnalysis,
  type HeyGenAvatarOverlayPlan,
  type HeyGenAvatarResolvedPlacement,
  type HeyGenAvatarResolvedPositioning,
  type HeyGenAvatarSize,
  type VideoCanvas,
} from "./tour-avatar.types";

export function resolveHeyGenAvatarPlacement(input: {
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: HeyGenAvatarResolvedPositioning;
  analysis: HeyGenAvatarAlphaAnalysis;
}): HeyGenAvatarResolvedPlacement {
  const preset = HEYGEN_AVATAR_SIZE_PRESETS[input.size];
  const targetVisibleWidth = input.canvas.width * preset.visibleWidthRatio;
  if (input.analysis.medianBox.width <= 0 || input.analysis.sourceWidth <= 0) {
    throw new TourAvatarError(
      "Cannot resolve avatar placement from an empty alpha bounding box.",
      "AVATAR_LAYOUT_FAILED"
    );
  }

  const avatarWidth =
    input.positioning.avatarWidth && input.positioning.avatarWidth > 0
      ? Math.round(input.positioning.avatarWidth)
      : Math.round(
          input.analysis.sourceWidth * (targetVisibleWidth / input.analysis.medianBox.width)
        );
  const scaleFactor = avatarWidth / input.analysis.sourceWidth;
  const horizontalMargin = input.positioning.rightMargin ?? preset.rightMargin;
  const bottomMargin = input.positioning.bottomMargin ?? preset.bottomMargin;
  let overlayX: string;
  let overlayY: string;

  if (input.positioning.basis === "videoLayer") {
    overlayX =
      input.positioning.anchor === "bottom-right"
        ? `W-w-${formatNumber(horizontalMargin)}`
        : formatNumber(horizontalMargin);
    overlayY = `H-h-${formatNumber(bottomMargin)}`;
  } else {
    const visibleLeft = input.analysis.medianBox.x * scaleFactor;
    const visibleRight = input.analysis.medianBox.right * scaleFactor;
    const visibleBottom = input.analysis.medianBox.bottom * scaleFactor;
    overlayX =
      input.positioning.anchor === "bottom-right"
        ? `W-${formatNumber(visibleRight)}-${formatNumber(horizontalMargin)}`
        : `${formatNumber(horizontalMargin)}-${formatNumber(visibleLeft)}`;
    overlayY = `H-${formatNumber(visibleBottom)}-${formatNumber(bottomMargin)}`;
  }

  return {
    avatarWidth,
    anchor: input.positioning.anchor,
    rightMargin: horizontalMargin,
    bottomMargin,
    basis: input.positioning.basis,
    overlayX,
    overlayY,
  };
}

export function buildHeyGenAvatarOverlayPlan(input: {
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  placement: HeyGenAvatarResolvedPlacement;
}): HeyGenAvatarOverlayPlan {
  const avatarScaleFilter = `scale=${input.placement.avatarWidth}:-1`;
  const backgroundFilter =
    `[0:v]scale=${input.canvas.width}:${input.canvas.height}:force_original_aspect_ratio=increase,` +
    `crop=${input.canvas.width}:${input.canvas.height}[bg]`;
  const overlayFilter = `[1:v]${avatarScaleFilter}[av];[bg][av]overlay=x=${input.placement.overlayX}:y=${input.placement.overlayY}:format=auto[v]`;

  return {
    canvas: input.canvas,
    size: input.size,
    placement: input.placement,
    ffmpeg: {
      avatarInputCodec: "libvpx-vp9",
      backgroundFilter,
      avatarScaleFilter,
      overlayFilter,
      filterComplex: `${backgroundFilter};${overlayFilter}`,
      outputVideoCodec: "libx264",
      outputAudioCodec: "aac",
      preserveAlpha: true,
    },
  };
}
