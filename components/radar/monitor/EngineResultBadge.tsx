"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_ENGINE_LABELS, type RadarResult, type Sentiment } from "@/types/radar";

interface EngineResultBadgeProps {
  result: RadarResult;
}

const SENTIMENT_STYLES: Record<Sentiment, { bg: string; text: string; label: string }> = {
  positive: { bg: "bg-green-500/10", text: "text-green-400", label: "Positive" },
  neutral: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Neutral" },
  negative: { bg: "bg-red-500/10", text: "text-red-400", label: "Negative" },
};

export function EngineResultBadge({ result }: EngineResultBadgeProps) {
  const engineLabel = AI_ENGINE_LABELS[result.engine];
  const sentimentStyle = result.sentiment
    ? SENTIMENT_STYLES[result.sentiment]
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs",
        result.brand_mentioned
          ? "border-green-500/20 bg-green-500/5"
          : "border-border bg-transparent"
      )}
    >
      {/* Mention indicator */}
      <div
        className={cn(
          "shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
          result.brand_mentioned
            ? "bg-green-500/20"
            : "bg-red-500/10"
        )}
      >
        {result.brand_mentioned ? (
          <Check className="h-3 w-3 text-green-400" />
        ) : (
          <X className="h-3 w-3 text-red-400/60" />
        )}
      </div>

      {/* Engine info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{engineLabel}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {result.position != null && (
            <span className="text-muted-foreground">
              #{result.position}
            </span>
          )}
          {sentimentStyle && (
            <span
              className={cn(
                "px-1 py-0.5 rounded text-[10px] font-medium",
                sentimentStyle.bg,
                sentimentStyle.text
              )}
            >
              {sentimentStyle.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
