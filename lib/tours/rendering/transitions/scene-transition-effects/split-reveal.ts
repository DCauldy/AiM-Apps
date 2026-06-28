import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./utils";

/*
 * Transition: Split reveal.
 * Visual description: The frame splits into two or more panels that open apart, revealing
 * Scene B underneath. For example, Scene A splits vertically and moves left/right like
 * sliding doors.
 * Use case: Before/after, staged/unstaged, and day/night variants.
 * Implementation meaning: Use two masks or two duplicated halves of Scene A. Move the halves
 * apart while B is visible underneath. Can be vertical split, horizontal split, or center-out.
 */

const splitRevealEffectNames = [
  "split-reveal",
] as const;

type SplitRevealEffect = (typeof splitRevealEffectNames)[number];

export const sceneTransitionEffects = Object.fromEntries(
  splitRevealEffectNames.map((effect) => [
    effect,
    {
      effect,
      label: "Split reveal",
      description:
        "Scene A separates into panels that move apart to reveal Scene B underneath.",
      useCase: "Before/after, staged/unstaged, day/night variants, or paired visual comparisons.",
      buildSceneJoinArgs: buildSplitRevealSceneJoinArgs,
    } satisfies SceneTransitionEffectDefinition,
  ])
) as SceneTransitionEffectDefinitionMap;

export const sceneTransitionEffect = sceneTransitionEffects["split-reveal"];

function buildSplitRevealSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Split reveal transition join requires at least two clips.");
  }
  const requestedEffect = String(input.transitionSettings.effect);
  if (!isSplitRevealEffect(requestedEffect)) {
    throw new Error(`Unsupported scene transition effect: ${requestedEffect}.`);
  }

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Split reveal transition duration must be greater than zero.");
  }

  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps},settb=AVTB`;
  const progressExpression = `min(1,(t+1/${input.fps})/${formattedTransitionSeconds})`;
  const isHorizontal = false;

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
          `Scene ${plan.sceneId} transition handles must be at least ${formattedTransitionSeconds}s for split reveal.`
        );
      }

      const outgoingLabel = `out${index}`;
      const incomingLabel = `in${index + 1}`;
      const firstSourceLabel = `firstSource${index}`;
      const secondSourceLabel = `secondSource${index}`;
      const firstPanelLabel = `firstPanel${index}`;
      const secondPanelLabel = `secondPanel${index}`;
      const layeredLabel = `layered${index}`;
      const transitionLabel = `trans${index}`;
      const outgoingStartSeconds = roundTransitionSeconds(
        plan.incomingHandleSeconds + plan.targetDurationSeconds
      );

      filterParts.push(
        `[${index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}]split=2[${firstSourceLabel}][${secondSourceLabel}]`
      );

      if (isHorizontal) {
        filterParts.push(
          `[${firstSourceLabel}]crop=w=iw:h=ih/2:x=0:y=0[${firstPanelLabel}]`
        );
        filterParts.push(
          `[${secondSourceLabel}]crop=w=iw:h=ih/2:x=0:y=ih/2[${secondPanelLabel}]`
        );
        filterParts.push(
          `[${incomingLabel}][${firstPanelLabel}]overlay=x=0:y='-h*${progressExpression}':shortest=1:format=auto[${layeredLabel}]`
        );
        filterParts.push(
          `[${layeredLabel}][${secondPanelLabel}]overlay=x=0:y='H/2+h*${progressExpression}':shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
        );
      } else {
        filterParts.push(
          `[${firstSourceLabel}]crop=w=iw/2:h=ih:x=0:y=0[${firstPanelLabel}]`
        );
        filterParts.push(
          `[${secondSourceLabel}]crop=w=iw/2:h=ih:x=iw/2:y=0[${secondPanelLabel}]`
        );
        filterParts.push(
          `[${incomingLabel}][${firstPanelLabel}]overlay=x='-w*${progressExpression}':y=0:shortest=1:format=auto[${layeredLabel}]`
        );
        filterParts.push(
          `[${layeredLabel}][${secondPanelLabel}]overlay=x='W/2+w*${progressExpression}':y=0:shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
        );
      }

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

function isSplitRevealEffect(effect: string): effect is SplitRevealEffect {
  return splitRevealEffectNames.includes(effect as SplitRevealEffect);
}
