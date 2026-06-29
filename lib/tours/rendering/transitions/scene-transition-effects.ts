import type { SceneTiming } from "./scene-boundaries";
import { sceneTransitionEffect as crossBlurEffect } from "./scene-transition-effects/cross-blur";
import { sceneTransitionEffect as crossDissolveEffect } from "./scene-transition-effects/cross-dissolve";
import { sceneTransitionEffect as crossZoomEffect } from "./scene-transition-effects/cross-zoom";
import { sceneTransitionEffect as fadeEffect } from "./scene-transition-effects/fade";
import { sceneTransitionEffect as irisEffect } from "./scene-transition-effects/iris";
import { sceneTransitionEffect as softWipeEffect } from "./scene-transition-effects/soft-wipe";
import { sceneTransitionEffect as splitRevealEffect } from "./scene-transition-effects/split-reveal";
import { sceneTransitionEffect as swipeOnTopEffect } from "./scene-transition-effects/push-slide";
import { sceneTransitionEffect as whipPanEffect } from "./scene-transition-effects/whip-pan";
import type {
  BuildSceneTransitionJoinArgsInput,
  SceneTransitionEffectDefinition,
  SceneTransitionEffectDefinitionMap,
} from "./scene-transition-effects/types";
import { formatTransitionSeconds, roundTransitionSeconds } from "./scene-transition-effects/utils";

export const SCENE_TRANSITION_EFFECT_SECONDS = 0.5;
export const SCENE_TRANSITION_EFFECT_HANDLE_POLICY_VERSION = "tour-scene-transition-handles-v1";

export const RESOLVED_SCENE_TRANSITION_EFFECTS = [
  "swipe-on-top",
  "cross-dissolve",
  "fade",
  "cross-blur",
  "cross-zoom",
  "iris",
  "soft-wipe",
  "split-reveal",
  "whip-pan",
] as const;

export type ResolvedSceneTransitionEffect = (typeof RESOLVED_SCENE_TRANSITION_EFFECTS)[number];
export type SceneTransitionEffect = "auto" | ResolvedSceneTransitionEffect;

export type SceneTransitionEffectOption = {
  value: SceneTransitionEffect;
  label: string;
  description: string;
  useCase: string;
};

export const SCENE_TRANSITION_EFFECT_DEFINITIONS = {
  "swipe-on-top": swipeOnTopEffect,
  "cross-dissolve": crossDissolveEffect,
  fade: fadeEffect,
  "cross-blur": crossBlurEffect,
  "cross-zoom": crossZoomEffect,
  iris: irisEffect,
  "soft-wipe": softWipeEffect,
  "split-reveal": splitRevealEffect,
  "whip-pan": whipPanEffect,
} satisfies Record<ResolvedSceneTransitionEffect, SceneTransitionEffectDefinition> &
  SceneTransitionEffectDefinitionMap;

export const RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS = RESOLVED_SCENE_TRANSITION_EFFECTS.map(
  (effect) => ({
    value: effect,
    label: SCENE_TRANSITION_EFFECT_DEFINITIONS[effect].label,
    description: SCENE_TRANSITION_EFFECT_DEFINITIONS[effect].description,
    useCase: SCENE_TRANSITION_EFFECT_DEFINITIONS[effect].useCase,
  })
) satisfies Array<{
  value: ResolvedSceneTransitionEffect;
  label: string;
  description: string;
  useCase: string;
}>;

export const SCENE_TRANSITION_EFFECT_OPTIONS = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Let the script planner choose the best transition from the scene image and tour pacing.",
    useCase:
      "Default per-scene choice when the transition should be selected from visual context.",
  },
  ...RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS,
] satisfies SceneTransitionEffectOption[];

export const DEFAULT_SCENE_TRANSITION_EFFECT: SceneTransitionEffect = "auto";
export const DEFAULT_RESOLVED_SCENE_TRANSITION_EFFECT: ResolvedSceneTransitionEffect =
  "swipe-on-top";

const SCENE_TRANSITION_EFFECT_SET = new Set<SceneTransitionEffect>(
  SCENE_TRANSITION_EFFECT_OPTIONS.map((option) => option.value)
);
const RESOLVED_SCENE_TRANSITION_EFFECT_SET = new Set<ResolvedSceneTransitionEffect>(
  RESOLVED_SCENE_TRANSITION_EFFECTS
);

export type SceneTransitionEffectSettings = {
  durationSeconds: number;
  effect: ResolvedSceneTransitionEffect;
  handlePolicyVersion: string;
};

export type SceneClipHandlePlan = {
  sceneId: string;
  index: number;
  totalSceneCount: number;
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  incomingHandleSeconds: number;
  outgoingHandleSeconds: number;
};

export type SceneClipTransitionEffectFingerprint = {
  settings: SceneTransitionEffectSettings;
  handlePlan: SceneClipHandlePlan;
};

export type JoinedSceneTransitionEffectSegment = {
  sceneId: string;
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  incomingHandleSeconds: number;
  outgoingHandleSeconds: number;
};

export type SceneTransitionJoinArgsInput = BuildSceneTransitionJoinArgsInput & {
  sceneTransitionEffects?: readonly ResolvedSceneTransitionEffect[];
};

type TransitionFilterInput = {
  filterParts: string[];
  index: number;
  plan: SceneClipHandlePlan;
  nextPlan: SceneClipHandlePlan;
  effect: ResolvedSceneTransitionEffect;
  transitionSeconds: number;
  formattedTransitionSeconds: string;
  width: number;
  height: number;
  fps: number;
  videoFormat: string;
};

export function isSceneTransitionEffect(value: unknown): value is SceneTransitionEffect {
  return (
    typeof value === "string" &&
    SCENE_TRANSITION_EFFECT_SET.has(value as SceneTransitionEffect)
  );
}

export function isResolvedSceneTransitionEffect(
  value: unknown
): value is ResolvedSceneTransitionEffect {
  return (
    typeof value === "string" &&
    RESOLVED_SCENE_TRANSITION_EFFECT_SET.has(value as ResolvedSceneTransitionEffect)
  );
}

export function getSceneTransitionEffectDefinition(
  effect: ResolvedSceneTransitionEffect
): SceneTransitionEffectDefinition {
  return SCENE_TRANSITION_EFFECT_DEFINITIONS[effect];
}

export function getSceneTransitionEffectLabel(effect: string): string {
  return (
    SCENE_TRANSITION_EFFECT_OPTIONS.find((option) => option.value === effect)?.label ??
    effect
  );
}

export function resolveSceneTransitionEffectSettings(options?: {
  effect?: ResolvedSceneTransitionEffect;
}): SceneTransitionEffectSettings {
  return {
    durationSeconds: SCENE_TRANSITION_EFFECT_SECONDS,
    effect: options?.effect ?? DEFAULT_RESOLVED_SCENE_TRANSITION_EFFECT,
    handlePolicyVersion: SCENE_TRANSITION_EFFECT_HANDLE_POLICY_VERSION,
  };
}

export function planSceneClipTransitionHandles(input: {
  durations: SceneTiming[];
  transitionSettings: SceneTransitionEffectSettings;
}): SceneClipHandlePlan[] {
  const transitionSeconds = input.transitionSettings.durationSeconds;
  const hasSceneTransitionEffects = input.durations.length > 1;

  return input.durations.map((duration, index) => {
    const incomingHandleSeconds = hasSceneTransitionEffects && index > 0 ? transitionSeconds : 0;
    const outgoingHandleSeconds =
      hasSceneTransitionEffects && index < input.durations.length - 1 ? transitionSeconds : 0;
    const targetDurationSeconds = duration.durationSeconds;
    return {
      sceneId: duration.sceneId,
      index,
      totalSceneCount: input.durations.length,
      targetDurationSeconds,
      requestedDurationSeconds: roundSeconds(
        targetDurationSeconds + incomingHandleSeconds + outgoingHandleSeconds
      ),
      incomingHandleSeconds,
      outgoingHandleSeconds,
    };
  });
}

export function buildSceneClipTransitionEffectFingerprint(input: {
  transitionSettings: SceneTransitionEffectSettings;
  handlePlan: SceneClipHandlePlan;
}): SceneClipTransitionEffectFingerprint {
  return {
    settings: input.transitionSettings,
    handlePlan: input.handlePlan,
  };
}

export function joinedSceneTransitionEffectSegments(
  handlePlans: SceneClipHandlePlan[]
): JoinedSceneTransitionEffectSegment[] {
  return handlePlans.map((plan) => ({
    sceneId: plan.sceneId,
    targetDurationSeconds: plan.targetDurationSeconds,
    requestedDurationSeconds: plan.requestedDurationSeconds,
    incomingHandleSeconds: plan.incomingHandleSeconds,
    outgoingHandleSeconds: plan.outgoingHandleSeconds,
  }));
}

export function expectedJoinedScenesDurationSeconds(handlePlans: SceneClipHandlePlan[]): number {
  return roundSeconds(
    handlePlans.reduce((sum, plan) => sum + plan.targetDurationSeconds, 0)
  );
}

export function buildSceneTransitionJoinArgs(input: SceneTransitionJoinArgsInput): string[] {
  validateJoinInput(input);

  const transitionSeconds = roundTransitionSeconds(input.transitionSettings.durationSeconds);
  if (transitionSeconds <= 0) {
    throw new Error("Scene transition duration must be greater than zero.");
  }

  const formattedTransitionSeconds = formatTransitionSeconds(transitionSeconds);
  const filterParts: string[] = [];
  const segmentLabels: string[] = [];
  const videoFormat = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1,fps=${input.fps}`;

  for (const [index, plan] of input.handlePlans.entries()) {
    const boundaryEffect = getBoundaryTransitionEffect(input, index);
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

      appendTransitionFilter({
        filterParts,
        index,
        plan,
        nextPlan,
        effect: boundaryEffect,
        transitionSeconds,
        formattedTransitionSeconds,
        width: input.width,
        height: input.height,
        fps: input.fps,
        videoFormat,
      });
      segmentLabels.push(`[trans${index}]`);
    }
  }

  filterParts.push(`${segmentLabels.join("")}concat=n=${segmentLabels.length}:v=1:a=0[outv]`);

  return buildFfmpegArgs(input, filterParts);
}

export function buildSwipeOnTopSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[] {
  return buildSceneTransitionJoinArgs({
    ...input,
    transitionSettings: {
      ...input.transitionSettings,
      effect: "swipe-on-top",
    },
  });
}

function getBoundaryTransitionEffect(
  input: SceneTransitionJoinArgsInput,
  outgoingSceneIndex: number
): ResolvedSceneTransitionEffect {
  const incomingSceneEffect = input.sceneTransitionEffects?.[outgoingSceneIndex + 1];
  return incomingSceneEffect ?? input.transitionSettings.effect;
}

function appendTransitionFilter(input: TransitionFilterInput): void {
  switch (input.effect) {
    case "swipe-on-top":
      appendSwipeOnTopTransitionFilter(input);
      return;
    case "cross-dissolve":
      appendXfadeTransitionFilter(input, "fade", "cross dissolve");
      return;
    case "fade":
      appendFadeTransitionFilter(input);
      return;
    case "cross-blur":
      appendCrossBlurTransitionFilter(input);
      return;
    case "cross-zoom":
      appendCrossZoomTransitionFilter(input);
      return;
    case "iris":
      appendIrisTransitionFilter(input);
      return;
    case "soft-wipe":
      appendXfadeTransitionFilter(input, "smoothleft", "soft wipe");
      return;
    case "split-reveal":
      appendSplitRevealTransitionFilter(input);
      return;
    case "whip-pan":
      appendWhipPanTransitionFilter(input);
      return;
  }
}

function appendSwipeOnTopTransitionFilter(input: TransitionFilterInput): void {
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=rgba[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=rgba[${incomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${incomingLabel}]overlay=x='max(0,W-W*t/${input.formattedTransitionSeconds})':y=0:shortest=1:format=auto,format=yuv420p[trans${input.index}]`
  );
}

function appendXfadeTransitionFilter(
  input: TransitionFilterInput,
  xfadeTransition: string,
  effectLabel: string
): void {
  assertFullTransitionHandles(input, effectLabel);
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p[${incomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${incomingLabel}]xfade=transition=${xfadeTransition}:duration=${input.formattedTransitionSeconds}:offset=0,format=yuv420p[trans${input.index}]`
  );
}

function appendFadeTransitionFilter(input: TransitionFilterInput): void {
  const halfTransitionSeconds = roundTransitionSeconds(input.transitionSeconds / 2);
  if (
    input.plan.outgoingHandleSeconds < halfTransitionSeconds ||
    input.nextPlan.incomingHandleSeconds < halfTransitionSeconds
  ) {
    throw new Error(
      `Scene ${input.plan.sceneId} transition handles must be at least ${formatTransitionSeconds(halfTransitionSeconds)}s for fade.`
    );
  }

  const outgoingLabel = `fadeOut${input.index}`;
  const incomingLabel = `fadeIn${input.index + 1}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );
  const incomingStartSeconds = roundTransitionSeconds(
    input.nextPlan.incomingHandleSeconds - halfTransitionSeconds
  );

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${formatTransitionSeconds(halfTransitionSeconds)},setpts=PTS-STARTPTS,${input.videoFormat},fade=t=out:st=0:d=${formatTransitionSeconds(halfTransitionSeconds)}:color=black,format=yuv420p[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=${formatTransitionSeconds(incomingStartSeconds)}:duration=${formatTransitionSeconds(halfTransitionSeconds)},setpts=PTS-STARTPTS,${input.videoFormat},fade=t=in:st=0:d=${formatTransitionSeconds(halfTransitionSeconds)}:color=black,format=yuv420p[${incomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${incomingLabel}]concat=n=2:v=1:a=0[trans${input.index}]`
  );
}

function appendCrossBlurTransitionFilter(input: TransitionFilterInput): void {
  assertFullTransitionHandles(input, "cross blur");
  const blurSigma = 18;
  const blurMixExpression = `A*(1-T/${input.formattedTransitionSeconds})+B*(T/${input.formattedTransitionSeconds})`;
  const outgoingSharpLabel = `outSharp${input.index}`;
  const outgoingBlurLabel = `outBlur${input.index}`;
  const outgoingTransitionLabel = `outTrans${input.index}`;
  const incomingBlurLabel = `inBlur${input.index + 1}`;
  const incomingSharpLabel = `inSharp${input.index + 1}`;
  const incomingTransitionLabel = `inTrans${input.index + 1}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p,split=2[${outgoingSharpLabel}][${outgoingBlurLabel}]`
  );
  input.filterParts.push(
    `[${outgoingBlurLabel}]gblur=sigma=${blurSigma}:steps=2[${outgoingBlurLabel}red]`
  );
  input.filterParts.push(
    `[${outgoingSharpLabel}][${outgoingBlurLabel}red]blend=all_expr='${blurMixExpression}',format=yuv420p[${outgoingTransitionLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p,split=2[${incomingBlurLabel}][${incomingSharpLabel}]`
  );
  input.filterParts.push(
    `[${incomingBlurLabel}]gblur=sigma=${blurSigma}:steps=2[${incomingBlurLabel}red]`
  );
  input.filterParts.push(
    `[${incomingBlurLabel}red][${incomingSharpLabel}]blend=all_expr='${blurMixExpression}',format=yuv420p[${incomingTransitionLabel}]`
  );
  input.filterParts.push(
    `[${outgoingTransitionLabel}][${incomingTransitionLabel}]xfade=transition=fade:duration=${input.formattedTransitionSeconds}:offset=0,format=yuv420p[trans${input.index}]`
  );
}

function appendCrossZoomTransitionFilter(input: TransitionFilterInput): void {
  assertFullTransitionHandles(input, "cross zoom");
  const maxScale = 1.08;
  const transitionFrameCount = Math.max(2, Math.round(input.transitionSeconds * input.fps));
  const zoomProgressDenominator = transitionFrameCount - 1;
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );
  const outgoingZoomExpression = `1+${formatTransitionSeconds(maxScale - 1)}*on/${zoomProgressDenominator}`;
  const incomingZoomExpression = `${formatTransitionSeconds(maxScale)}-${formatTransitionSeconds(maxScale - 1)}*on/${zoomProgressDenominator}`;
  const zoomPanPosition = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${input.width}x${input.height}:fps=${input.fps}`;

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},zoompan=z='${outgoingZoomExpression}':${zoomPanPosition},format=yuv420p[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},zoompan=z='${incomingZoomExpression}':${zoomPanPosition},format=yuv420p[${incomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${incomingLabel}]xfade=transition=fade:duration=${input.formattedTransitionSeconds}:offset=0,format=yuv420p[trans${input.index}]`
  );
}

function appendIrisTransitionFilter(input: TransitionFilterInput): void {
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  const maskLabel = `mask${input.index}`;
  const maskedIncomingLabel = `masked${input.index + 1}`;
  const videoFormat = `${input.videoFormat},settb=AVTB`;
  const maskProgressExpression = `min(1,(T+1/${input.fps})/${input.formattedTransitionSeconds})`;
  const maskRadiusExpression = `hypot(W/2,H/2)*${maskProgressExpression}`;

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
  );
  input.filterParts.push(
    `color=black:s=${input.width}x${input.height}:r=${input.fps}:d=${input.formattedTransitionSeconds},format=gray,geq=lum='if(lte(hypot(X-W/2,Y-H/2),${maskRadiusExpression}),255,0)'[${maskLabel}]`
  );
  input.filterParts.push(
    `[${incomingLabel}][${maskLabel}]alphamerge[${maskedIncomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${maskedIncomingLabel}]overlay=x=0:y=0:shortest=1:format=auto,format=yuv420p[trans${input.index}]`
  );
}

function appendSplitRevealTransitionFilter(input: TransitionFilterInput): void {
  assertFullTransitionHandles(input, "split reveal");
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  const firstSourceLabel = `firstSource${input.index}`;
  const secondSourceLabel = `secondSource${input.index}`;
  const firstPanelLabel = `firstPanel${input.index}`;
  const secondPanelLabel = `secondPanel${input.index}`;
  const layeredLabel = `layered${input.index}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );
  const videoFormat = `${input.videoFormat},settb=AVTB`;
  const progressExpression = `min(1,(t+1/${input.fps})/${input.formattedTransitionSeconds})`;

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
  );
  input.filterParts.push(`[${outgoingLabel}]split=2[${firstSourceLabel}][${secondSourceLabel}]`);
  input.filterParts.push(`[${firstSourceLabel}]crop=w=iw/2:h=ih:x=0:y=0[${firstPanelLabel}]`);
  input.filterParts.push(
    `[${secondSourceLabel}]crop=w=iw/2:h=ih:x=iw/2:y=0[${secondPanelLabel}]`
  );
  input.filterParts.push(
    `[${incomingLabel}][${firstPanelLabel}]overlay=x='-w*${progressExpression}':y=0:shortest=1:format=auto[${layeredLabel}]`
  );
  input.filterParts.push(
    `[${layeredLabel}][${secondPanelLabel}]overlay=x='W/2+w*${progressExpression}':y=0:shortest=1:format=auto,format=yuv420p[trans${input.index}]`
  );
}

function appendWhipPanTransitionFilter(input: TransitionFilterInput): void {
  assertFullTransitionHandles(input, "whip pan");
  const outgoingLabel = `out${input.index}`;
  const incomingLabel = `in${input.index + 1}`;
  const outgoingStartSeconds = roundTransitionSeconds(
    input.plan.incomingHandleSeconds + input.plan.targetDurationSeconds
  );

  input.filterParts.push(
    `[${input.index}:v]trim=start=${formatTransitionSeconds(outgoingStartSeconds)}:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p[${outgoingLabel}]`
  );
  input.filterParts.push(
    `[${input.index + 1}:v]trim=start=0:duration=${input.formattedTransitionSeconds},setpts=PTS-STARTPTS,${input.videoFormat},format=yuv420p[${incomingLabel}]`
  );
  input.filterParts.push(
    `[${outgoingLabel}][${incomingLabel}]xfade=transition=slideleft:duration=${input.formattedTransitionSeconds}:offset=0,avgblur=sizeX=28:sizeY=1:planes=7,format=yuv420p[trans${input.index}]`
  );
}

function assertFullTransitionHandles(input: TransitionFilterInput, effectLabel: string): void {
  if (
    input.plan.outgoingHandleSeconds < input.transitionSeconds ||
    input.nextPlan.incomingHandleSeconds < input.transitionSeconds
  ) {
    throw new Error(
      `Scene ${input.plan.sceneId} transition handles must be at least ${input.formattedTransitionSeconds}s for ${effectLabel}.`
    );
  }
}

function validateJoinInput(input: SceneTransitionJoinArgsInput): void {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1) {
    throw new Error("Scene transition join requires at least two clips.");
  }
  for (const effect of input.sceneTransitionEffects ?? []) {
    if (!isResolvedSceneTransitionEffect(effect)) {
      throw new Error(`Unsupported scene transition effect: ${String(effect)}.`);
    }
  }
}

function buildFfmpegArgs(input: SceneTransitionJoinArgsInput, filterParts: string[]): string[] {
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

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
