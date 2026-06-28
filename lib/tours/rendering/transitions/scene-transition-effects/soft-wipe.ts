import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Soft wipe.
 * Visual description: Scene B is revealed across Scene A by a moving edge, but the edge
 * is feathered or blurred, like a smooth curtain passing over the image.
 * Use case: Moving from one room to another.
 * Implementation meaning: Use a moving mask from left, right, top, or bottom. The mask
 * edge should be soft rather than a hard line. Scene A stays in place while Scene B
 * appears behind or over it.
 */

const softWipeEffectNames = [
  "soft-wipe",
] as const;

type SoftWipeEffectName = (typeof softWipeEffectNames)[number];

export const sceneTransitionEffects = Object.fromEntries(
  softWipeEffectNames.map((effect) => [
    effect,
    {
      effect,
      label: "Soft wipe",
      description:
        "Scene B is revealed across Scene A by a moving feathered edge.",
      useCase: "Moving from one room to another while keeping the transition smooth and understated.",
      buildSceneJoinArgs: buildSoftWipeSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["soft-wipe"];

function buildSoftWipeSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Soft wipe transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (!isSoftWipeEffect(requestedEffect)) {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Soft wipe transition duration must be greater than zero.");
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;
  const wipeTransition = "smoothleft";

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
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for soft wipe.`
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
        `[${outgoingLabel}][${incomingLabel}]xfade=transition=${wipeTransition}:duration=${formattedTransitionSeconds}:offset=0,format=yuv420p[${transitionLabel}]`
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

function isSoftWipeEffect(value: string): value is SoftWipeEffectName {
  return softWipeEffectNames.includes(value as SoftWipeEffectName);
}
