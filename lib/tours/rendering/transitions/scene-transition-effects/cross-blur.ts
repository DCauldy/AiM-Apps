import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Cross blur.
 * Visual description: Scene A becomes increasingly blurry while Scene B appears blurred
 * at first, then sharpens. The viewer perceives a soft visual reset between unrelated rooms.
 * Use case: Joining two rooms that look visually unrelated.
 * Implementation meaning: Increase blur on A while fading it out; fade B in while reducing
 * blur from high to zero. No major motion is required.
 */

export const sceneTransitionEffects = {
  "cross-blur": {
    effect: "cross-blur",
    label: "Cross blur",
    description:
      "Scene A softens into blur while Scene B appears blurred, then sharpens into focus.",
    useCase: "Joining two rooms or compositions that look visually unrelated.",
    buildSceneJoinArgs: buildCrossBlurSceneJoinArgs,
  },
} satisfies SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["cross-blur"];

function buildCrossBlurSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Cross blur transition join requires at least two clips.");
  }

  const requestedEffect = String(input.transitionSettings.effect);
  if (requestedEffect !== "cross-blur") {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Cross blur transition duration must be greater than zero.");
  }

  const blurSigma = 18;
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const blurMixExpression = `A*(1-T/${formattedTransitionSeconds})+B*(T/${formattedTransitionSeconds})`;
  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;

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
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for cross blur.`
        );
      }

      const outgoingSharpLabel = `outSharp${index}`;
      const outgoingBlurLabel = `outBlur${index}`;
      const outgoingTransitionLabel = `outTrans${index}`;
      const incomingBlurLabel = `inBlur${index + 1}`;
      const incomingSharpLabel = `inSharp${index + 1}`;
      const incomingTransitionLabel = `inTrans${index + 1}`;
      const transitionLabel = `trans${index}`;
      const outgoingStartSeconds = roundTransitionSeconds(
        plan.incomingHandleSeconds + plan.targetDurationSeconds
      );

      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p,split=2[${outgoingSharpLabel}][${outgoingBlurLabel}]`
      );
      filterParts.push(
        `[${outgoingBlurLabel}]gblur=sigma=${blurSigma}:steps=2[${outgoingBlurLabel}red]`
      );
      filterParts.push(
        `[${outgoingSharpLabel}][${outgoingBlurLabel}red]blend=all_expr='${blurMixExpression}',format=yuv420p[${outgoingTransitionLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p,split=2[${incomingBlurLabel}][${incomingSharpLabel}]`
      );
      filterParts.push(
        `[${incomingBlurLabel}]gblur=sigma=${blurSigma}:steps=2[${incomingBlurLabel}red]`
      );
      filterParts.push(
        `[${incomingBlurLabel}red][${incomingSharpLabel}]blend=all_expr='${blurMixExpression}',format=yuv420p[${incomingTransitionLabel}]`
      );
      filterParts.push(
        `[${outgoingTransitionLabel}][${incomingTransitionLabel}]xfade=transition=fade:duration=${formattedTransitionSeconds}:offset=0,format=yuv420p[${transitionLabel}]`
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
