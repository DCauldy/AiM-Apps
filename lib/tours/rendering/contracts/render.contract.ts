import type { TourRenderAsset } from "../repositories/tour-render.repository.types";
import type { TourRenderInvestigationOptions } from "../options/render-options";

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
  | "failed"
  | "cancelled";

export type TourRenderTimelineStep = {
  key: TourRenderStep | string;
  label: string;
  detail: string;
};

export type TourRenderRunStatusResponse = {
  id: string;
  projectId: string;
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
    downloadUrl?: string;
    storagePath?: string;
  } | null;
  error: {
    message: string;
  } | null;
  triggerRunId: string | null;
  options: TourRenderInvestigationOptions;
};

export type TourRenderRunAssetResponse = TourRenderAsset & {
  name: string;
  url: string;
};

export type TourRenderRunsResponse = {
  runs: TourRenderRunStatusResponse[];
};

export type TourRenderRunResponse = {
  run: TourRenderRunStatusResponse;
};

export type TourRenderRunAssetsResponse = {
  assets: TourRenderRunAssetResponse[];
};

export function isTourRenderRunActive(run: Pick<TourRenderRunStatusResponse, "status">): boolean {
  return run.status === "queued" || run.status === "running";
}

export function formatTourVideoDownloadFilename(title: string | null | undefined): string {
  const baseName = (title ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  const filename = baseName || "tour-video";
  return /\.mp4$/i.test(filename) ? filename : `${filename}.mp4`;
}
