"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisibilityScoreProps {
  score: number | null;
  previousScore?: number;
  lastCheckAt?: string | null;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function getScoreGradient(score: number): string {
  if (score >= 70) return "from-green-500/20 to-green-500/5";
  if (score >= 40) return "from-yellow-500/20 to-yellow-500/5";
  return "from-red-500/20 to-red-500/5";
}

function getScoreRingColor(score: number): string {
  if (score >= 70) return "stroke-green-400";
  if (score >= 40) return "stroke-yellow-400";
  return "stroke-red-400";
}

export function VisibilityScore({ score, previousScore, lastCheckAt }: VisibilityScoreProps) {
  const change = score != null && previousScore != null
    ? score - previousScore
    : null;

  const circumference = 2 * Math.PI * 54;
  const dashOffset = score != null
    ? circumference - (score / 100) * circumference
    : circumference;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6",
        score != null && `bg-gradient-to-br ${getScoreGradient(score)}`
      )}
    >
      <div className="flex items-center gap-6">
        {/* Score ring */}
        <div className="relative shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            {/* Background ring */}
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-border"
            />
            {/* Score ring */}
            {score != null && (
              <circle
                cx="64"
                cy="64"
                r="54"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className={getScoreRingColor(score)}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {score != null ? (
              <>
                <span className={cn("text-3xl font-bold", getScoreColor(score))}>
                  {score}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  / 100
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold text-muted-foreground">--</span>
                <span className="text-[10px] text-muted-foreground">
                  No data
                </span>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Visibility Score
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-1">
            Weighted score across all monitored AI engines. Higher means you
            appear more often and more prominently.
          </p>
          {lastCheckAt && (
            <p className="text-[11px] text-muted-foreground/70 mb-3">
              Last check on {new Date(lastCheckAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at {new Date(lastCheckAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          {!lastCheckAt && <div className="mb-3" />}

          {change != null && change !== 0 && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                change > 0
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              )}
            >
              {change > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span>
                {change > 0 ? "+" : ""}
                {change} from last check
              </span>
            </div>
          )}

          {change === 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              <span>No change from last check</span>
            </div>
          )}

          {score == null && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e0a458]/10 text-[#e0a458]">
              Run your first check to see your score
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
