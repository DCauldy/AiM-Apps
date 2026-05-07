"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PipelineProgress,
  PipelineStepStatus,
} from "@/types/blog-engine";
import { PIPELINE_STEP_LABELS } from "@/types/blog-engine";

interface ActiveRunProgressProps {
  progress: PipelineProgress;
}

export function ActiveRunProgress({ progress }: ActiveRunProgressProps) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="font-sans text-sm font-semibold text-foreground mb-4">
        Generating your blog...
      </h3>

      <div className="flex items-start gap-0">
        {progress.steps.map((step, index) => (
          <div key={step.step} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center">
              {/* Step indicator */}
              <StepIcon status={step.status} />
              {/* Label */}
              <span
                className={cn(
                  "text-[10px] mt-1.5 text-center leading-tight",
                  step.status === "completed"
                    ? "text-[#31DBA5]"
                    : step.status === "active"
                      ? "text-foreground font-medium"
                      : step.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                )}
              >
                {PIPELINE_STEP_LABELS[step.step]}
              </span>
            </div>

            {/* Connector line */}
            {index < progress.steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 mt-2.5 mx-1",
                  step.status === "completed"
                    ? "bg-[#31DBA5]"
                    : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {progress.error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {progress.error}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: PipelineStepStatus }) {
  switch (status) {
    case "completed":
      return (
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#31DBA5] shrink-0">
          <Check className="h-3 w-3 text-[#111519]" />
        </div>
      );
    case "active":
      return (
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary shrink-0">
          <Loader2 className="h-3 w-3 text-primary-foreground animate-spin" />
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-destructive shrink-0">
          <span className="text-[10px] text-white font-bold">!</span>
        </div>
      );
    case "skipped":
      return (
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted shrink-0">
          <span className="text-[10px] text-muted-foreground">-</span>
        </div>
      );
    default:
      return (
        <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />
      );
  }
}
