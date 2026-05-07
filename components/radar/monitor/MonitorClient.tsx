"use client";

import { useState, useMemo } from "react";
import { List, Grid3X3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QueryResultCard } from "./QueryResultCard";
import { EngineResultBadge } from "./EngineResultBadge";
import { AI_ENGINE_LABELS, type AIEngine, type RadarCheck, type RadarResult, type RadarQuery } from "@/types/radar";

interface MonitorClientProps {
  checks: RadarCheck[];
  results: Array<RadarResult & { query?: RadarQuery }>;
}

type ViewMode = "query" | "engine";

export function MonitorClient({ checks, results }: MonitorClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("query");
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(
    checks.length > 0 ? checks[0].id : null
  );

  // Filter results for selected check
  const filteredResults = useMemo(() => {
    if (!selectedCheckId) return results;
    return results.filter((r) => r.check_id === selectedCheckId);
  }, [results, selectedCheckId]);

  // Group results by query
  const queryGroups = useMemo(() => {
    const groups = new Map<string, { query: RadarQuery | null; results: RadarResult[] }>();
    for (const result of filteredResults) {
      const key = result.query_id;
      if (!groups.has(key)) {
        groups.set(key, { query: result.query || null, results: [] });
      }
      groups.get(key)!.results.push(result);
    }
    return Array.from(groups.entries()).map(([queryId, data]) => ({
      queryId,
      ...data,
    }));
  }, [filteredResults]);

  // Group results by engine
  const engineGroups = useMemo(() => {
    const groups = new Map<AIEngine, RadarResult[]>();
    for (const result of filteredResults) {
      if (!groups.has(result.engine)) {
        groups.set(result.engine, []);
      }
      groups.get(result.engine)!.push(result);
    }
    return Array.from(groups.entries()).map(([engine, engineResults]) => ({
      engine,
      results: engineResults,
    }));
  }, [filteredResults]);

  const selectedCheck = checks.find((c) => c.id === selectedCheckId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Monitor</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              View how your brand appears across AI engines for each query.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Check selector */}
            {checks.length > 0 && (
              <select
                value={selectedCheckId || ""}
                onChange={(e) => setSelectedCheckId(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#e0a458]/50"
              >
                {checks.map((check) => (
                  <option key={check.id} value={check.id}>
                    {check.completed_at
                      ? new Date(check.completed_at).toLocaleDateString()
                      : "In progress"}{" "}
                    {check.trigger === "manual" ? "(manual)" : "(scheduled)"}
                  </option>
                ))}
              </select>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("query")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
                  viewMode === "query"
                    ? "bg-[#e0a458]/10 text-[#e0a458]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" />
                By Query
              </button>
              <button
                onClick={() => setViewMode("engine")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-border",
                  viewMode === "engine"
                    ? "bg-[#e0a458]/10 text-[#e0a458]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                By Engine
              </button>
            </div>
          </div>
        </div>

        {/* Status banner */}
        {selectedCheck?.status === "running" && (
          <div className="flex items-center gap-2 rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/5 px-4 py-3 text-sm text-[#e0a458]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Check in progress... Results will appear as engines respond.
          </div>
        )}

        {/* Content */}
        {filteredResults.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">
              No results yet. Run a check from the dashboard to see how you appear.
            </p>
          </div>
        ) : viewMode === "query" ? (
          <div className="space-y-3">
            {queryGroups.map((group) => (
              <QueryResultCard
                key={group.queryId}
                query={group.query}
                results={group.results}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {engineGroups.map(({ engine, results: engineResults }) => (
              <div key={engine} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {AI_ENGINE_LABELS[engine]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {engineResults.map((result) => (
                    <EngineResultBadge key={result.id} result={result} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
