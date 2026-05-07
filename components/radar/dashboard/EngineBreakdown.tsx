"use client";

import { cn } from "@/lib/utils";
import { AI_ENGINE_LABELS, type AIEngine } from "@/types/radar";
import {
  MessageSquare,
  Search,
  Sparkles,
  Globe,
  Brain,
  Compass,
  Bot,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EngineBreakdownProps {
  results: Array<{
    engine: AIEngine;
    brand_mentioned: boolean;
    position?: number;
    quality_score: number;
  }>;
  engines: AIEngine[];
}

const ENGINE_ICONS: Record<AIEngine, LucideIcon> = {
  chatgpt: MessageSquare,
  perplexity: Search,
  gemini: Sparkles,
  google_aio: Globe,
  google_ai_mode: Brain,
  copilot: Compass,
  claude: Bot,
  grok: Zap,
};

function getEngineScore(
  engine: AIEngine,
  results: EngineBreakdownProps["results"]
): number | null {
  const engineResults = results.filter((r) => r.engine === engine);
  if (engineResults.length === 0) return null;

  const totalScore = engineResults.reduce((sum, r) => sum + r.quality_score, 0);
  return Math.round(totalScore / engineResults.length);
}

function getScoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBg(score: number | null): string {
  if (score == null) return "bg-muted/30";
  if (score >= 70) return "bg-green-500/10";
  if (score >= 40) return "bg-yellow-500/10";
  return "bg-red-500/10";
}

export function EngineBreakdown({ results, engines }: EngineBreakdownProps) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Engine Breakdown
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {engines.map((engine) => {
          const score = getEngineScore(engine, results);
          const Icon = ENGINE_ICONS[engine];
          const label = AI_ENGINE_LABELS[engine];

          return (
            <div
              key={engine}
              className={cn(
                "rounded-lg border p-3 text-center transition-colors hover:bg-accent/30",
                score != null ? "border-border" : "border-dashed border-border/50"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2",
                  getScoreBg(score)
                )}
              >
                <Icon className={cn("h-4 w-4", getScoreColor(score))} />
              </div>
              <p className="text-[10px] text-muted-foreground truncate mb-1" title={label}>
                {label}
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  getScoreColor(score)
                )}
              >
                {score != null ? score : "--"}
              </p>
            </div>
          );
        })}
      </div>

      {results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          Run a check to see per-engine visibility scores.
        </p>
      )}
    </div>
  );
}
