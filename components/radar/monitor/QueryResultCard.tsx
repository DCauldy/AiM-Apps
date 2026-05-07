"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EngineResultBadge } from "./EngineResultBadge";
import type { RadarResult, RadarQuery } from "@/types/radar";

interface QueryResultCardProps {
  query: RadarQuery | null;
  results: RadarResult[];
}

export function QueryResultCard({ query, results }: QueryResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const mentionCount = results.filter((r) => r.brand_mentioned).length;
  const totalEngines = results.length;
  const mentionRate = totalEngines > 0
    ? Math.round((mentionCount / totalEngines) * 100)
    : 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mention rate indicator */}
          <div
            className={cn(
              "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
              mentionRate >= 60
                ? "bg-green-500/10 text-green-400"
                : mentionRate >= 30
                  ? "bg-yellow-500/10 text-yellow-400"
                  : "bg-red-500/10 text-red-400"
            )}
          >
            {mentionRate}%
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {query?.query_text || "Unknown query"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {query?.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c4c8a]/20 text-blue-300">
                  {query.category}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {mentionCount}/{totalEngines} engines
              </span>
            </div>
          </div>
        </div>

        {/* Quick status dots */}
        <div className="flex items-center gap-1 mr-3">
          {results.slice(0, 8).map((result) => (
            <div
              key={result.id}
              className={cn(
                "w-2 h-2 rounded-full",
                result.brand_mentioned ? "bg-green-400" : "bg-red-400/40"
              )}
              title={`${result.engine}: ${result.brand_mentioned ? "mentioned" : "not mentioned"}`}
            />
          ))}
        </div>

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {results.map((result) => (
              <EngineResultBadge key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
