import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Zoom / cross zoom.
 * Visual description: The camera appears to zoom into Scene A, then continues into Scene B.
 * It can feel like moving through a doorway or focusing on the next room.
 * Use case: Moving into a detail shot or next room.
 * Implementation meaning: Scale A up slightly while fading out. Scale B from slightly larger
 * or smaller back to normal while fading in. Keep the scale subtle, for example 1.00 to 1.08.
 */

const CROSS_ZOOM_MAX_SCALE = 1.08;

export const sceneTransitionEffects = {
  "cross-zoom": {
    effect: "cross-zoom",
    buildSceneJoinArgs: buildCrossZoomSceneJoinArgs,
  },
} satisfies SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["cross-zoom"];

function buildCrossZoomSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Cross zoom transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (requestedEffect !== "cross-zoom") {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Cross zoom transition duration must be greater than zero.");
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;
  const transitionFrameCount = Math.max(2, Math.round(transitionSeconds * input.fps));
  const zoomProgressDenominator = transitionFrameCount - 1;

  for (const [index, plan] of input.handlePlans.entries()) {
    if (plan.outgoingHandleSeconds > 0 && plan.targetDurationSeconds <= transitionSeconds) {
      throw new Error(
        `Scene ${plan.sceneId} target duration must be longer than the ${formattedTransitionSeconds}s transition.`
      );
    }

    const bodyDurationSeconds = roundTransitionSeconds(
      plan.targetDurationSeconds - (plan.outgoingHandleSeconds > 0 ? transitionSeconds : 0)
    );
    if (bodyDurationSeconds > 0) {
      const bodyLabel = `body${index}`;
      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(plan.incomingHandleSeconds)}:duration=${formatTransitionSeconds(bodyDurationSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p[${bodyLabel}]`
      );
      segmentLabels.push(`[${bodyLabel}]`);
    }

    if (plan.outgoingHandleSeconds > 0) {
      const nextPlan = input.handlePlans[index + 1];
      if (!nextPlan || nextPlan.incomingHandleSeconds <= 0) {
        throw new Error(`Scene ${plan.sceneId} is missing the next incoming transition handle.`);
      }
      if (
        plan.outgoingHandleSeconds < transitionSeconds ||
        nextPlan.incomingHandleSeconds < transitionSeconds
      ) {
        throw new Error(
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for cross zoom.`
        );
      }

      const outgoingLabel = `out${index}`;
      const incomingLabel = `in${index + 1}`;
      const transitionLabel = `trans${index}`;
      const outgoingStartSeconds = roundTransitionSeconds(
        plan.incomingHandleSeconds + plan.targetDurationSeconds
      );
      const outgoingZoomExpression = `1+${formatTransitionSeconds(CROSS_ZOOM_MAX_SCALE - 1)}*on/${zoomProgressDenominator}`;
      const incomingZoomExpression = `${formatTransitionSeconds(CROSS_ZOOM_MAX_SCALE)}-${formatTransitionSeconds(CROSS_ZOOM_MAX_SCALE - 1)}*on/${zoomProgressDenominator}`;
      const zoomPanPosition = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${input.width}x${input.height}:fps=${input.fps}`;

      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},zoompan=z='${outgoingZoomExpression}':${zoomPanPosition},format=yuv420p[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},zoompan=z='${incomingZoomExpression}':${zoomPanPosition},format=yuv420p[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${incomingLabel}]xfade=transition=fade:duration=${formattedTransitionSeconds}:offset=0,format=yuv420p[${transitionLabel}]`
      );
      segmentLabels.push(`[${transitionLabel}]`);
    }
  }

  filterParts.push(`${segmentLabels.join("")}concat=n=${segmentLabels.length}:v=1:a=0[outv]`);

  return [
    "-y",
    ...input.sceneClipPaths.flatMap((clipPath) => ["-i", clipPath]),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    input.videoCodec,
    "-preset",
    input.preset,
    "-crf",
    String(input.crf),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];
}
