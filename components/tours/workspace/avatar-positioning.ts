export type HeyGenAvatarProjectPosition = {
  frame: { width: 1080; height: 1920 };
  offsets: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
};

export type AvatarPreviewRect = {
  frameWidth: number;
  frameHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CANONICAL_AVATAR_FRAME = { width: 1080, height: 1920 } as const;

export function previewRectToProjectPosition(rect: AvatarPreviewRect): HeyGenAvatarProjectPosition {
  const scaleX = CANONICAL_AVATAR_FRAME.width / rect.frameWidth;
  const scaleY = CANONICAL_AVATAR_FRAME.height / rect.frameHeight;
  const left = Math.round(rect.left * scaleX);
  const top = Math.round(rect.top * scaleY);
  const right = Math.round(CANONICAL_AVATAR_FRAME.width - (rect.left + rect.width) * scaleX);
  const bottom = Math.round(CANONICAL_AVATAR_FRAME.height - (rect.top + rect.height) * scaleY);

  return {
    frame: { ...CANONICAL_AVATAR_FRAME },
    offsets: { top, left, bottom, right },
  };
}

export function projectPositionToPreviewRect(input: {
  position: HeyGenAvatarProjectPosition;
  frameWidth: number;
  frameHeight: number;
}): AvatarPreviewRect {
  const scaleX = input.frameWidth / CANONICAL_AVATAR_FRAME.width;
  const scaleY = input.frameHeight / CANONICAL_AVATAR_FRAME.height;
  const left = input.position.offsets.left * scaleX;
  const top = input.position.offsets.top * scaleY;
  return {
    frameWidth: input.frameWidth,
    frameHeight: input.frameHeight,
    left,
    top,
    width:
      (CANONICAL_AVATAR_FRAME.width - input.position.offsets.left - input.position.offsets.right) * scaleX,
    height:
      (CANONICAL_AVATAR_FRAME.height - input.position.offsets.top - input.position.offsets.bottom) * scaleY,
  };
}
