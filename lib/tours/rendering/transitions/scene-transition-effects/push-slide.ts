import type {
  SceneClipHandlePlan,
  SceneTransitionEffectSettings,
} from "../scene-transition-effects";
import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Push / slide, including the current cover-from-right implementation.
 * Visual description: Scene B moves into frame while Scene A either moves out with it
 * for a true push, or stays fixed underneath while Scene B covers it for a slide/cover.
 * The existing effect is cover-from-right: Scene B slides in from the right and replaces
 * Scene A while Scene A remains stationary.
 * Use case: Simulated walking direction, entering a room, showing a feature wall, or
 * opening into a space.
 * Implementation meaning: For push, offset A and B together so B enters as A exits.
 * For cover/slide, keep A fixed and overlay B with an animated x/y position. The current
 * FFmpeg filter trims outgoing/incoming handles, formats both streams, then overlays the
 * incoming clip from x=W to x=0 across the transition duration.
 */

const pushSlideEffectNames = ["swipe-on-top"] as const;

export const sceneTransitionEffects = Object.fromEntries(
  pushSlideEffectNames.map((effect) => [
    effect,
    {
      effect,
      label: "Swipe on top",
      description:
        "The incoming scene slides across the outgoing frame and covers it cleanly.",
      useCase:
        "Simulated walking direction, entering a room, opening into a space, or revealing a feature wall.",
      buildSceneJoinArgs: buildPushSlideSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["swipe-on-top"];

function buildPushSlideSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  return buildSwipeOnTopSceneJoinArgs({
    ...input,
    transitionSettings: {
      ...input.transitionSettings,
      effect: "swipe-on-top",
    },
  });
}

export function buildSwipeOnTopSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Swipe transition join requires at least two clips.");
  }
  if (input.transitionSettings.effect !== "swipe-on-top") {
    throw new Error(`Unsupported scene transition effect: ${input.transitionSettings.effect}.`);
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const transitionSeconds = input.transitionSettings.durationSeconds;
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
      const outgoingLabel = `out${index}`;
      const incomingLabel = `in${index + 1}`;
      const transitionLabel = `trans${index}`;
      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(plan.incomingHandleSeconds + plan.targetDurationSeconds)}:duration=${formatTransitionSeconds(transitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formatTransitionSeconds(transitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${incomingLabel}]overlay=x='max(0,W-W*t/${formatTransitionSeconds(transitionSeconds)})':y=0:shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
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
