import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Fade and dip to black.
 * Visual description: Fade gently fades the image out, then fades the next image in,
 * creating a soft pause between rooms. Dip to black fades Scene A to a full black frame,
 * then fades Scene B up from black for a clearer chapter break.
 * Use case: Fade works for slower luxury tours and exterior-to-interior changes. Dip to
 * black works for section breaks such as exterior to interior or downstairs to upstairs.
 * Implementation meaning: Fade usually inserts a black, white, or neutral-dark interval
 * between clips. Dip to black fades A to black, optionally holds briefly, then fades B in
 * from black. Use cross dissolve when a visible black frame is not desired.
 */

const fadeEffectNames = ["fade"] as const;

export const sceneTransitionEffects = Object.fromEntries(
  fadeEffectNames.map((effect) => [
    effect,
    {
      effect,
      buildSceneJoinArgs: buildFadeSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects.fade;

function buildFadeSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Fade transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (!fadeEffectNames.includes(requestedEffect as (typeof fadeEffectNames)[number])) {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const transitionSeconds = input.transitionSettings.durationSeconds;
  const halfTransitionSeconds = roundTransitionSeconds(transitionSeconds / 2);
  if (halfTransitionSeconds <= 0) {
    throw new Error("Fade transition duration must be greater than zero.");
  }

  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;

  for (const [index, plan] of input.handlePlans.entries()) {
    if (plan.outgoingHandleSeconds > 0 && plan.targetDurationSeconds <= transitionSeconds) {
      throw new Error(
        `Scene ${plan.sceneId} target duration must be longer than the ${transitionSeconds}s transition.`
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
        plan.outgoingHandleSeconds < halfTransitionSeconds ||
        nextPlan.incomingHandleSeconds < halfTransitionSeconds
      ) {
        throw new Error(
          `Scene ${plan.sceneId} transition handles must be at least ${halfTransitionSeconds}s for fade.`
        );
      }

      const outgoingLabel = `fadeOut${index}`;
      const incomingLabel = `fadeIn${index + 1}`;
      const transitionLabel = `trans${index}`;
      const outgoingStartSeconds = roundTransitionSeconds(
        plan.incomingHandleSeconds + plan.targetDurationSeconds
      );
      const incomingStartSeconds = roundTransitionSeconds(
        nextPlan.incomingHandleSeconds - halfTransitionSeconds
      );

      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formatTransitionSeconds(halfTransitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},fade=t=out:st=0:d=${formatTransitionSeconds(halfTransitionSeconds)}:color=black,format=yuv420p[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=${formatTransitionSeconds(incomingStartSeconds)}:duration=${formatTransitionSeconds(halfTransitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},fade=t=in:st=0:d=${formatTransitionSeconds(halfTransitionSeconds)}:color=black,format=yuv420p[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${incomingLabel}]concat=n=2:v=1:a=0[${transitionLabel}]`
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
