import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Iris / circle open.
 * Visual description: A circular opening expands from a point, revealing Scene B through
 * the circle until it fills the whole frame, like a camera aperture opening.
 * Use case: Highlighting details such as a fireplace, pool, kitchen island, or other
 * focal point.
 * Implementation meaning: Use a circular mask. Start with a small circle at the center or
 * feature point, then expand the radius until B fills the frame. Scene A remains outside
 * the circle until fully replaced.
 */

const irisEffectNames = ["iris"] as const;

export const sceneTransitionEffects = Object.fromEntries(
  irisEffectNames.map((effect) => [
    effect,
    {
      effect,
      buildSceneJoinArgs: buildIrisSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects.iris;

function buildIrisSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Iris transition join requires at least two clips.");
  }
  if (!isIrisEffect(input.transitionSettings.effect)) {
    throw new Error(`Unsupported scene transition effect: ${input.transitionSettings.effect}.`);
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const transitionSeconds = input.transitionSettings.durationSeconds;
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps},settb=AVTB`;
  const maskProgressExpression = `min(1,(T+1/${input.fps})/${formattedTransitionSeconds})`;
  const maskRadiusExpression = `hypot(W/2,H/2)*${maskProgressExpression}`;

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
      const maskLabel = `mask${index}`;
      const maskedIncomingLabel = `masked${index + 1}`;
      const transitionLabel = `trans${index}`;
      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(plan.incomingHandleSeconds + plan.targetDurationSeconds)}:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
      );
      filterParts.push(
        `color=black:s=${input.width}x${input.height}:r=${input.fps}:d=${formattedTransitionSeconds},format=gray,geq=lum='if(lte(hypot(X-W/2,Y-H/2),${maskRadiusExpression}),255,0)'[${maskLabel}]`
      );
      filterParts.push(
        `[${incomingLabel}][${maskLabel}]alphamerge[${maskedIncomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${maskedIncomingLabel}]overlay=x=0:y=0:shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
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

function isIrisEffect(effect: string): effect is (typeof irisEffectNames)[number] {
  return irisEffectNames.includes(effect as (typeof irisEffectNames)[number]);
}
