import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Light leak / bloom.
 * Visual description: A soft flare, glow, or warm wash passes over the frame during the
 * cut. Scene B appears through the brightness, like sunlight hitting the lens.
 * Use case: Luxury, sunset, exterior, pool, and lifestyle shots.
 * Implementation meaning: Overlay a bright blurred gradient or flare during the transition
 * while cross-dissolving A to B. Keep opacity low. This is usually an overlay plus dissolve,
 * not a standalone transition.
 */

export const sceneTransitionEffects = {
  "light-leak": {
    effect: "light-leak",
    buildSceneJoinArgs: buildLightLeakSceneJoinArgs,
  },
} satisfies SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["light-leak"];

function buildLightLeakSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Light leak transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (requestedEffect !== "light-leak") {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Light leak transition duration must be greater than zero.");
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;
  const leakWidth = Math.max(1, Math.round(input.width * 1.05));
  const warmBandWidth = Math.max(1, Math.round(leakWidth * 0.78));
  const whiteBandX = Math.round(leakWidth * 0.2);
  const whiteBandWidth = Math.max(1, Math.round(leakWidth * 0.22));

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
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for light leak.`
        );
      }

      const outgoingLabel = `out${index}`;
      const incomingLabel = `in${index + 1}`;
      const blendedLabel = `blend${index}`;
      const leakLabel = `leak${index}`;
      const transitionLabel = `trans${index}`;
      const outgoingStartSeconds = roundTransitionSeconds(
        plan.incomingHandleSeconds + plan.targetDurationSeconds
      );

      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${incomingLabel}]xfade=transition=fade:duration=${formattedTransitionSeconds}:offset=0,format=rgba[${blendedLabel}]`
      );
      filterParts.push(
        `color=c=black@0.0:s=${leakWidth}x${input.height}:r=${input.fps}:d=${formattedTransitionSeconds},format=rgba,drawbox=x=0:y=0:w=${warmBandWidth}:h=${input.height}:color=0xffb66d@0.28:t=fill:replace=1,drawbox=x=${whiteBandX}:y=0:w=${whiteBandWidth}:h=${input.height}:color=white@0.18:t=fill:replace=1,boxblur=luma_radius=84:luma_power=2:chroma_radius=84:chroma_power=2:alpha_radius=84:alpha_power=2[${leakLabel}]`
      );
      filterParts.push(
        `[${blendedLabel}][${leakLabel}]overlay=x='-w+(W+w)*t/${formattedTransitionSeconds}':y=0:shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
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
