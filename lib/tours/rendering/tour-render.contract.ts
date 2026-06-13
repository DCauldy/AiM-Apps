export type TourRenderRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type TourRenderStep =
  | "queued"
  | "preparing_assets"
  | "planning_script"
  | "generating_voiceover"
  | "generating_avatar"
  | "detecting_transitions"
  | "rendering_scene_clips"
  | "joining_video"
  | "uploading_final"
  | "completed"
  | "failed";

export type TourRenderTimelineStep = {
  key: TourRenderStep | string;
  label: string;
  detail: string;
};

export type TourRenderRunStatusResponse = {
  id: string;
  status: TourRenderRunStatus;
  step: TourRenderStep | string;
  label: string;
  timelineSteps: TourRenderTimelineStep[];
  progressPercent: number;
  sceneClipCounts: {
    completed: number;
    total: number;
  };
  updatedAt: string;
  result: {
    assetId: string;
  } | null;
  error: {
    message: string;
  } | null;
  triggerRunId: string | null;
};

export function isTourRenderRunActive(run: Pick<TourRenderRunStatusResponse, "status">): boolean {
  return run.status === "queued" || run.status === "running";
}
