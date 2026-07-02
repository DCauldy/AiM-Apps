"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================
// Heat build progress — the "what's being built" experience, modeled on
// Hyperlocal's CampaignBuildProgress / the Tours render panel, in Heat's
// Fire Red. Driven by real task progress streamed over SSE from the
// heat-enrich run: steps light up as the pipeline moves.
// ============================================================

const PHASES = [
  { key: "find", label: "Finding listings", detail: "Scanning the area for active listings", until: 30 },
  { key: "demand", label: "Reading demand", detail: "Pulling live views & saves for every listing", until: 85 },
  { key: "rank", label: "Ranking by Heat Score", detail: "Scoring what buyers are actually watching", until: 100 },
] as const;

function activeKey(percent: number): string {
  return (PHASES.find((p) => percent < p.until) ?? PHASES[PHASES.length - 1]).key;
}

export function HeatBuildProgress({
  percent,
  step,
}: {
  percent: number;
  step?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const active = PHASES.find((p) => p.key === activeKey(pct)) ?? PHASES[0];
  const activeIdx = PHASES.findIndex((p) => p.key === active.key);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            🔥 Building your hot sheet
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
          <LoaderCircle className="mt-0.5 h-6 w-6 shrink-0 animate-spin stroke-[2.5] text-[#FF3B30]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{active.detail}</p>
            {step && <p className="mt-1 text-xs text-muted-foreground">{step}</p>}
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FF3B30] to-[#C2410C] transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Vertical step list */}
      <ol className="mt-5 space-y-2">
        {PHASES.map((s, idx) => {
          const state = idx < activeIdx ? "complete" : idx === activeIdx ? "active" : "pending";
          return (
            <li
              key={s.key}
              className={cn(
                "rounded-lg border px-4 py-3 transition-colors",
                state === "active"
                  ? "border-[#FF3B30]/45 bg-[#FF3B30]/10 text-foreground shadow-[0_0_28px_rgba(255,59,48,0.10)]"
                  : state === "complete"
                    ? "border-border/70 bg-background/35 text-foreground"
                    : "border-border/50 bg-background/20 text-muted-foreground/55",
              )}
            >
              <div className="flex items-center gap-3">
                {state === "complete" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#FF3B30]" />
                ) : state === "active" ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#FF3B30]" />
                ) : (
                  <span className="ml-0.5 mr-0.5 h-3 w-3 shrink-0 rounded-full border border-muted-foreground/30" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
