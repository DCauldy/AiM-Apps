"use client";

import { useMemo } from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_ENGINE_LABELS, type AIEngine, type RadarQuery, type RadarResult, type RadarCompetitor } from "@/types/radar";

interface GapAnalysisProps {
  queries: RadarQuery[];
  results: RadarResult[];
  competitors: RadarCompetitor[];
}

interface GapEntry {
  query: RadarQuery;
  engine: AIEngine;
  competitorsPresent: string[];
  userMentioned: boolean;
}

export function GapAnalysis({ queries, results, competitors }: GapAnalysisProps) {
  // Find queries where competitors appear but user doesn't
  const gaps = useMemo(() => {
    const gapEntries: GapEntry[] = [];

    for (const query of queries) {
      const queryResults = results.filter((r) => r.query_id === query.id);

      // Group by engine
      const engineResultsMap = new Map<AIEngine, RadarResult[]>();
      for (const result of queryResults) {
        if (!engineResultsMap.has(result.engine)) {
          engineResultsMap.set(result.engine, []);
        }
        engineResultsMap.get(result.engine)!.push(result);
      }

      for (const [engine, engineResults] of engineResultsMap) {
        const userMentioned = engineResults.some((r) => r.brand_mentioned);

        // Find competitors mentioned in this engine for this query
        const competitorsPresent: string[] = [];
        for (const comp of competitors) {
          const isPresent = engineResults.some((r) =>
            r.competitors_mentioned.some(
              (c) => c.toLowerCase() === comp.name.toLowerCase()
            )
          );
          if (isPresent) {
            competitorsPresent.push(comp.name);
          }
        }

        // Only include if competitors are present but user is not
        if (!userMentioned && competitorsPresent.length > 0) {
          gapEntries.push({
            query,
            engine,
            competitorsPresent,
            userMentioned,
          });
        }
      }
    }

    return gapEntries;
  }, [queries, results, competitors]);

  // Group gaps by engine
  const gapsByEngine = useMemo(() => {
    const groups = new Map<AIEngine, GapEntry[]>();
    for (const gap of gaps) {
      if (!groups.has(gap.engine)) {
        groups.set(gap.engine, []);
      }
      groups.get(gap.engine)!.push(gap);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length);
  }, [gaps]);

  if (results.length === 0) {
    return (
      <div className="text-center py-16 rounded-lg border border-dashed border-border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No results yet. Run a check first to identify visibility gaps.
        </p>
      </div>
    );
  }

  if (gaps.length === 0) {
    return (
      <div className="text-center py-16 rounded-lg border border-dashed border-border">
        <Eye className="h-8 w-8 text-green-400/40 mx-auto mb-2" />
        <p className="text-sm text-foreground font-medium">No gaps found</p>
        <p className="text-xs text-muted-foreground mt-1">
          You appear in every query where your competitors are mentioned. Nice work!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <p className="text-sm font-semibold text-foreground">
            {gaps.length} visibility gap{gaps.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          These are queries where competitors appear in AI responses but you
          don&apos;t. Addressing these gaps can improve your visibility score.
        </p>
      </div>

      {/* Gaps grouped by engine */}
      {gapsByEngine.map(([engine, engineGaps]) => (
        <div key={engine} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {AI_ENGINE_LABELS[engine]}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">
              {engineGaps.length} gap{engineGaps.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-1.5">
            {engineGaps.map((gap) => (
              <div
                key={`${gap.query.id}-${gap.engine}`}
                className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <div className="shrink-0 w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5">
                  <EyeOff className="h-3 w-3 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {gap.query.query_text}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      Competitors present:
                    </span>
                    {gap.competitorsPresent.map((name) => (
                      <span
                        key={name}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
