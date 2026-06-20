import {
  analyzeHeyGenAvatarAlpha,
  collectWorkflowWarnings,
  exportHeyGenAvatarFrameChecks,
} from "./tour-avatar-analysis";
import { buildHeyGenAvatarOverlayPlan, resolveHeyGenAvatarPlacement } from "./tour-avatar-layout";
import {
  type HeyGenAvatarFrameCheck,
  type HeyGenAvatarMetadata,
  type HeyGenAvatarResolvedPositioning,
  type HeyGenAvatarSize,
  type VideoCanvas,
} from "./tour-avatar.types";

export async function prepareHeyGenAvatarMetadata(input: {
  avatarVideoPath: string;
  canvas: VideoCanvas;
  size: HeyGenAvatarSize;
  positioning: HeyGenAvatarResolvedPositioning;
  sampleEverySeconds: number;
  frameChecksDir?: string;
  frameCheckTimestampsSeconds?: number[];
}): Promise<HeyGenAvatarMetadata> {
  const analysis = await analyzeHeyGenAvatarAlpha({
    avatarVideoPath: input.avatarVideoPath,
    alphaThreshold: input.positioning.alphaThreshold,
    sampleEverySeconds: input.sampleEverySeconds,
  });
  const placement = resolveHeyGenAvatarPlacement({
    canvas: input.canvas,
    size: input.size,
    positioning: input.positioning,
    analysis,
  });
  const overlay = buildHeyGenAvatarOverlayPlan({
    canvas: input.canvas,
    size: input.size,
    placement,
  });
  const warnings = collectWorkflowWarnings(analysis);
  let frameChecks: HeyGenAvatarFrameCheck[] = [];

  if (input.frameChecksDir && input.frameCheckTimestampsSeconds?.length) {
    try {
      frameChecks = await exportHeyGenAvatarFrameChecks({
        avatarVideoPath: input.avatarVideoPath,
        outputDir: input.frameChecksDir,
        timestampsSeconds: input.frameCheckTimestampsSeconds,
      });
    } catch (error) {
      warnings.push({
        code: "frame-check-failed",
        message:
          error instanceof Error ? error.message : "Could not export HeyGen avatar frame checks.",
        severity: "warning",
      });
    }
  }

  return {
    analysis,
    overlay,
    frameChecks,
    warnings,
  };
}
