"use client";

import { LoaderCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Campaign build progress — a live, multi-step "we're building your
// campaign" experience, modeled on the Tours render-status panel.
// Purely presentational: driven by a phase list + the active phase +
// a percent. The Magic run experience feeds it real state from its
// existing poll (no new API), so steps light up as the pipeline moves.
// ============================================================

export interface BuildPhase {
  key: string;
  label: string;
  detail: string;
}

export interface CampaignBuildProgressProps {
  phases: BuildPhase[];
  /** Key of the currently-active phase. */
  activeKey: string;
  /** 0–100. */
  percent: number;
  /** Optional sub-line under the active step (e.g. "3 of 6 written"). */
  subLabel?: string;
}

type StepState = "complete" | "active" | "pending";

function stepState(phases: BuildPhase[], activeKey: string, key: string): StepState {
  const activeIdx = phases.findIndex((p) => p.key === activeKey);
  const idx = phases.findIndex((p) => p.key === key);
  if (idx < activeIdx) return "complete";
  if (idx === activeIdx) return "active";
  return "pending";
}

export function CampaignBuildProgress({
  phases,
  activeKey,
  percent,
  subLabel,
}: CampaignBuildProgressProps) {
  const active = phases.find((p) => p.key === activeKey) ?? phases[0];
  const pct = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div className="mx-auto w-full max-w-xl" aria-live="polite">
      {/* Header — big percent readout */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Building your campaign
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{active.label}</h1>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold tabular-nums">{pct}%</p>
          <p className="text-xs text-muted-foreground">Complete</p>
        </div>
      </div>

      {/* Current-step card */}
      <div className="mt-6 rounded-xl border border-border bg-background/45 p-5 shadow-sm backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <LoaderCircle className="mt-0.5 h-6 w-6 shrink-0 animate-spin stroke-[2.5] text-[#F43F5E]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{active.detail}</p>
            {subLabel && (
              <p className="mt-1 text-xs text-muted-foreground">{subLabel}</p>
            )}
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[#F43F5E] transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Vertical step list */}
      <ol className="mt-5 space-y-2">
        {phases.map((step) => {
          const state = stepState(phases, activeKey, step.key);
          return (
            <li
              key={step.key}
              className={cn(
                "rounded-lg border px-4 py-3 transition-colors",
                state === "active"
                  ? "border-[#F43F5E]/45 bg-[#F43F5E]/10 text-foreground shadow-[0_0_28px_rgba(244,63,94,0.10)]"
                  : state === "complete"
                    ? "border-border/70 bg-background/35 text-foreground"
                    : "border-border/50 bg-background/20 text-muted-foreground/55",
              )}
            >
              <div className="flex items-center gap-3">
                {state === "complete" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F43F5E]" />
                ) : state === "active" ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#F43F5E]" />
                ) : (
                  <span className="ml-0.5 mr-0.5 h-3 w-3 shrink-0 rounded-full border border-muted-foreground/30" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
