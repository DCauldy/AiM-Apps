import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Whip pan.
 * Visual description: The image rapidly streaks sideways with motion blur, then lands on
 * the next room. It mimics a fast camera pan.
 * Use case: Fast social-preview versions of a listing.
 * Implementation meaning: Move or offset A quickly in one direction with heavy directional
 * blur; B enters from the opposite side and sharpens at the end. Keep it short, roughly
 * 0.25 to 0.5 seconds.
 */

const whipPanEffectNames = ["whip-pan"] as const;

export const sceneTransitionEffects = Object.fromEntries(
  whipPanEffectNames.map((effect) => [
    effect,
    {
      effect,
      label: "Whip pan",
      description:
        "The image streaks sideways with directional blur, then lands quickly on the next scene.",
      useCase: "Fast social-preview pacing when the tour needs a punchier hook.",
      buildSceneJoinArgs: buildWhipPanSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["whip-pan"];

function buildWhipPanSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Whip pan transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (!whipPanEffectNames.includes(requestedEffect as (typeof whipPanEffectNames)[number])) {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Whip pan transition duration must be greater than zero.");
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;
  const slideTransition = "slideleft";

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
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for whip pan.`
        );
      }

      const outgoingLabel = `out${index}`;
      const incomingLabel = `in${index + 1}`;
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
        `[${outgoingLabel}][${incomingLabel}]xfade=transition=${slideTransition}:duration=${formattedTransitionSeconds}:offset=0,avgblur=sizeX=28:sizeY=1:planes=7,format=yuv420p[${transitionLabel}]`
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
