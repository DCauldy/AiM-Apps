"use client";

import { CheckCircle2, Download, LoaderCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatTourVideoDownloadFilename,
  isTourRenderRunActive,
  type TourRenderRunStatusResponse,
} from "@/lib/tours/rendering/contracts/render.contract";
import { TourRenderRunAssets } from "./TourRenderRunAssets";

const FALLBACK_STEPS = [
  { key: "queued", label: "Queued", detail: "Render request received" },
  {
    key: "preparing_assets",
    label: "Preparing Assets",
    detail: "Checking listing media and scene inputs",
  },
  {
    key: "planning_script",
    label: "Planning Script",
    detail: "Structuring the property tour",
  },
  {
    key: "rendering_scene_clips",
    label: "Rendering Scene Clips",
    detail: "Building individual scene video clips",
  },
  {
    key: "joining_video",
    label: "Joining Scene Clips",
    detail: "Combining rendered scenes",
  },
  {
    key: "uploading_final",
    label: "Uploading Final Video",
    detail: "Saving the generated tour",
  },
];

function getStepState(run: TourRenderRunStatusResponse, index: number) {
  const steps =
    run.timelineSteps.length > 0 ? run.timelineSteps : FALLBACK_STEPS;
  const activeIndex = steps.findIndex((step) => step.key === run.step);
  if (run.status === "completed") {
    return "complete";
  }
  if (activeIndex === -1) {
    return index === 0 ? "active" : "pending";
  }
  if (index < activeIndex) {
    return "complete";
  }
  if (index === activeIndex) {
    return "active";
  }
  return "pending";
}

function getVisibleSteps(run: TourRenderRunStatusResponse) {
  const steps =
    run.timelineSteps.length > 0 ? run.timelineSteps : FALLBACK_STEPS;
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === run.step),
  );
  const currentIndex =
    run.status === "completed" ? steps.length - 1 : activeIndex;

  if (currentIndex <= 1) {
    return steps.slice(0, 4);
  }

  if (currentIndex >= steps.length - 2) {
    return steps.slice(-5);
  }

  return steps.slice(currentIndex - 2, currentIndex + 3);
}

export function appendDownloadTitle(downloadUrl: string, title: string) {
  const filename = formatTourVideoDownloadFilename(title);
  try {
    const url = new URL(downloadUrl);
    url.searchParams.set("download", filename);
    return url.toString();
  } catch {
    const separator = downloadUrl.includes("?") ? "&" : "?";
    return `${downloadUrl}${separator}download=${encodeURIComponent(filename)}`;
  }
}

export function TourRenderStatusPanel({
  run,
  downloadTitle,
  onDone,
  onCancel,
  isCancelling = false,
}: {
  run: TourRenderRunStatusResponse;
  downloadTitle?: string;
  onDone?: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
}) {
  const active = isTourRenderRunActive(run);
  const completed = run.status === "completed";
  const failed = run.status === "failed";
  const cancelled = run.status === "cancelled";
  const steps =
    run.timelineSteps.length > 0 ? run.timelineSteps : FALLBACK_STEPS;
  const activeStep = completed
    ? {
        key: "completed",
        label: "Done",
        detail: "Your tour video is ready to download.",
      }
    : cancelled
      ? {
          key: "cancelled",
          label: "Render Cancelled",
          detail:
            run.error?.message ??
            "A newer render was started for this tour project.",
        }
    : (steps.find((step) => step.key === run.step) ??
      steps.find((step) => step.key === "rendering_scene_clips") ??
      steps[0]);
  const clipText =
    run.sceneClipCounts.total > 0
      ? `${run.sceneClipCounts.completed}/${run.sceneClipCounts.total} scene clips`
      : "Scene clips pending";
  const visibleSteps = getVisibleSteps(run);

  return (
    <section
      className="mt-5 min-h-[calc(100vh-14rem)] text-foreground"
      aria-live={active || completed ? "polite" : "off"}
    >
      <div className="w-full">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className="border-primary/35 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"
              >
                {run.status}
              </Badge>
              <span className="text-sm text-muted-foreground">{clipText}</span>
            </div>
          </div>

          <div className="min-w-[180px] text-left sm:text-right">
            <p className="text-4xl font-semibold tracking-normal text-foreground">
              {run.progressPercent}%
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Complete
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-md border border-border/70 bg-background/45 p-5 shadow-sm backdrop-blur-xl">
          <div className="flex items-start gap-4">
            {active ? (
              <LoaderCircle className="mt-1 h-6 w-6 shrink-0 animate-spin stroke-[2.5] text-primary" />
            ) : completed ? (
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 stroke-[2.5] text-primary" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {completed ? "Render Complete" : "Current Step"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                {activeStep.label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeStep.detail}
              </p>
            </div>
          </div>

          {failed && run.error?.message && (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {run.error.message}
            </div>
          )}

          {completed && (run.result?.downloadUrl || onDone) && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {run.result?.downloadUrl && (
                <Button asChild className="h-11 sm:w-auto">
                  <a
                    href={appendDownloadTitle(
                      run.result.downloadUrl,
                      downloadTitle ?? "tour-video",
                    )}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Download className="h-4 w-4" />
                    Download video
                  </a>
                </Button>
              )}
              {onDone && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:w-auto"
                  onClick={onDone}
                >
                  Back to workspace
                </Button>
              )}
            </div>
          )}

          {active && onCancel && (
            <div className="mt-5">
              <Button
                type="button"
                variant="destructive"
                className="h-11 sm:w-auto"
                onClick={onCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {isCancelling ? "Canceling render" : "Cancel render"}
              </Button>
            </div>
          )}

          {!completed && (
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${run.progressPercent}%` }}
              />
            </div>
          )}
        </div>
        {!completed && (
          <ol className="mt-8 w-full space-y-3">
            {visibleSteps.map((step) => {
              const index = steps.findIndex(
                (renderStep) => renderStep.key === step.key,
              );
              const state = getStepState(run, index);
              const isActive = state === "active";
              return (
                <li
                  key={step.key}
                  className={[
                    "rounded-md border px-4 py-3 backdrop-blur-xl transition-colors",
                    isActive
                      ? "border-primary/45 bg-primary/10 text-foreground shadow-[0_0_28px_rgba(99,102,241,0.12)]"
                      : state === "complete"
                        ? "border-border/70 bg-background/35 text-foreground"
                        : "border-border/50 bg-background/20 text-muted-foreground/55",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        isActive
                          ? "bg-primary"
                          : state === "complete"
                            ? "bg-foreground/45"
                            : "bg-muted-foreground/25",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{step.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {completed && <TourRenderRunAssets run={run} />}
      </div>
    </section>
  );
}
