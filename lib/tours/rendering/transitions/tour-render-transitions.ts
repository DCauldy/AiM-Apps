import type { SceneDuration } from "./tour-transitions";

export const TOUR_SCENE_TRANSITION_SECONDS = 0.5;
export const TOUR_SCENE_TRANSITION_HANDLE_POLICY_VERSION = "tour-scene-transition-handles-v1";

export type TourSceneTransitionEffect = "swipe-on-top";

export type TourSceneTransitionSettings = {
  enabled: boolean;
  durationSeconds: number;
  effect: TourSceneTransitionEffect;
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

export type SceneClipTransitionFingerprint = {
  settings: TourSceneTransitionSettings;
  handlePlan: SceneClipHandlePlan;
};

export type JoinedSceneTransitionSegment = {
  sceneId: string;
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  incomingHandleSeconds: number;
  outgoingHandleSeconds: number;
};

export function resolveTourSceneTransitionSettings(options?: {
  enabled?: boolean;
}): TourSceneTransitionSettings {
  return {
    enabled: options?.enabled !== false,
    durationSeconds: TOUR_SCENE_TRANSITION_SECONDS,
    effect: "swipe-on-top",
    handlePolicyVersion: TOUR_SCENE_TRANSITION_HANDLE_POLICY_VERSION,
  };
}

export function planSceneClipHandles(input: {
  durations: SceneDuration[];
  transitionSettings: TourSceneTransitionSettings;
}): SceneClipHandlePlan[] {
  const transitionSeconds = input.transitionSettings.durationSeconds;
  const transitionsEnabled = input.transitionSettings.enabled && input.durations.length > 1;

  return input.durations.map((duration, index) => {
    const incomingHandleSeconds = transitionsEnabled && index > 0 ? transitionSeconds : 0;
    const outgoingHandleSeconds =
      transitionsEnabled && index < input.durations.length - 1 ? transitionSeconds : 0;
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

export function buildSceneClipTransitionFingerprint(input: {
  transitionSettings: TourSceneTransitionSettings;
  handlePlan: SceneClipHandlePlan;
}): SceneClipTransitionFingerprint {
  return {
    settings: input.transitionSettings,
    handlePlan: input.handlePlan,
  };
}

export function joinedSceneTransitionSegments(
  handlePlans: SceneClipHandlePlan[]
): JoinedSceneTransitionSegment[] {
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

export function buildSwipeOnTopJoinArgs(input: {
  sceneClipPaths: string[];
  handlePlans: SceneClipHandlePlan[];
  transitionSettings: TourSceneTransitionSettings;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  preset: string;
  crf: number;
  outputPath: string;
}): string[] {
  if (input.sceneClipPaths.length !== input.handlePlans.length) {
    throw new Error("Scene clip path count does not match transition handle plan count.");
  }
  if (input.sceneClipPaths.length <= 1 || !input.transitionSettings.enabled) {
    throw new Error("Swipe transition join requires at least two clips and enabled transitions.");
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

    const bodyDurationSeconds = roundSeconds(
      plan.targetDurationSeconds - (plan.outgoingHandleSeconds > 0 ? transitionSeconds : 0)
    );
    if (bodyDurationSeconds > 0) {
      const bodyLabel = `body${index}`;
      filterParts.push(
        `[${index}:v]trim=start=${formatSeconds(plan.incomingHandleSeconds)}:duration=${formatSeconds(bodyDurationSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=yuv420p[${bodyLabel}]`
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
        `[${index}:v]trim=start=${formatSeconds(plan.incomingHandleSeconds + plan.targetDurationSeconds)}:duration=${formatSeconds(transitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${outgoingLabel}]`
      );
      filterParts.push(
        `[${index + 1}:v]trim=start=0:duration=${formatSeconds(transitionSeconds)},setpts=PTS-STARTPTS,${videoFormat},format=rgba[${incomingLabel}]`
      );
      filterParts.push(
        `[${outgoingLabel}][${incomingLabel}]overlay=x='max(0,W-W*t/${formatSeconds(transitionSeconds)})':y=0:shortest=1:format=auto,format=yuv420p[${transitionLabel}]`
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

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatSeconds(value: number): string {
  return roundSeconds(value).toFixed(3).replace(/\.?0+$/, "");
}
