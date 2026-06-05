"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { RunPhase } from "@/types/hyperlocal";

interface Step {
  id: string;
  label: string;
  phases: RunPhase[];        // phases at which this step is "current"
  doneAt: RunPhase[];        // phases at which this step is "done"
}

const STEPS: Step[] = [
  {
    id: "discover",
    label: "Discover",
    phases: ["discover"],
    doneAt: [
      "awaiting_service_area",
      "awaiting_mls",
      "generate",
      "review",
      "sending",
      "completed",
    ],
  },
  {
    id: "service-area",
    label: "Service Area",
    phases: ["awaiting_service_area"],
    doneAt: ["awaiting_mls", "generate", "review", "sending", "completed"],
  },
  {
    id: "mls",
    label: "MLS Upload",
    phases: ["awaiting_mls"],
    doneAt: ["generate", "review", "sending", "completed"],
  },
  {
    id: "generate",
    label: "Generate",
    phases: ["generate"],
    doneAt: ["review", "sending", "completed"],
  },
  {
    id: "review",
    label: "Review",
    phases: ["review"],
    doneAt: ["sending", "completed"],
  },
  {
    id: "send",
    label: "Send",
    phases: ["sending"],
    doneAt: ["completed"],
  },
];

export function RunPhaseStepper({ phase }: { phase: RunPhase }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
      {STEPS.map((step, idx) => {
        const isCurrent = step.phases.includes(phase);
        const isDone = step.doneAt.includes(phase);
        const failed =
          phase === "failed" || phase === "cancelled" ? isCurrent : false;
        return (
          <li
            key={step.id}
            className="flex items-center gap-2 sm:gap-3 shrink-0"
          >
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-medium",
                isDone
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : isCurrent
                    ? failed
                      ? "border-destructive text-destructive"
                      : "border-[#F43F5E] text-[#F43F5E] animate-pulse"
                    : "border-border text-muted-foreground"
              )}
            >
              {isDone ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span
              className={cn(
                "text-xs sm:text-sm font-medium",
                isCurrent
                  ? "text-foreground"
                  : isDone
                    ? "text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px w-4 sm:w-8",
                  isDone ? "bg-emerald-500" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
