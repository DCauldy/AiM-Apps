"use client";

import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RadarCompetitor, RadarResult } from "@/types/radar";

interface CompetitorLeaderboardProps {
  competitors: RadarCompetitor[];
  results: RadarResult[];
}

interface CompetitorScore {
  competitor: RadarCompetitor;
  mentionCount: number;
  totalQueries: number;
  sovPercentage: number;
}

export function CompetitorLeaderboard({
  competitors,
  results,
}: CompetitorLeaderboardProps) {
  // Calculate SOV (Share of Voice) for each competitor
  const totalQueryResults = results.length;

  const competitorScores: CompetitorScore[] = competitors
    .map((competitor) => {
      const mentionCount = results.filter((r) =>
        r.competitors_mentioned.some(
          (c) => c.toLowerCase() === competitor.name.toLowerCase()
        )
      ).length;

      const sovPercentage =
        totalQueryResults > 0
          ? Math.round((mentionCount / totalQueryResults) * 100)
          : 0;

      return {
        competitor,
        mentionCount,
        totalQueries: totalQueryResults,
        sovPercentage,
      };
    })
    .sort((a, b) => b.sovPercentage - a.sovPercentage);

  // Calculate user's own SOV for comparison
  const userMentionCount = results.filter((r) => r.brand_mentioned).length;
  const userSovPercentage =
    totalQueryResults > 0
      ? Math.round((userMentionCount / totalQueryResults) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* User's position */}
      <div className="rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#e0a458]/20 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-[#e0a458]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Your Brand</p>
              <p className="text-xs text-muted-foreground">
                {userMentionCount} mentions across {totalQueryResults} results
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[#e0a458]">
              {userSovPercentage}%
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              SOV
            </p>
          </div>
        </div>
        {/* SOV bar */}
        <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-[#e0a458] transition-all duration-700"
            style={{ width: `${userSovPercentage}%` }}
          />
        </div>
      </div>

      {/* Competitor list */}
      {competitors.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-dashed border-border">
          <Trophy className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No competitors tracked yet. Add competitors in Settings to see how you compare.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_120px_80px] gap-2 px-4 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Competitor</span>
            <span className="text-right">Mentions</span>
            <span>Share of Voice</span>
            <span className="text-right">vs You</span>
          </div>

          {/* Rows */}
          {competitorScores.map((item, index) => {
            const diff = item.sovPercentage - userSovPercentage;

            return (
              <div
                key={item.competitor.id}
                className={cn(
                  "grid grid-cols-[1fr_100px_120px_80px] gap-2 items-center px-4 py-3 text-sm",
                  index < competitorScores.length - 1 && "border-b border-border"
                )}
              >
                {/* Name + rank */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-5 text-center shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-foreground truncate">
                    {item.competitor.name}
                  </span>
                </div>

                {/* Mention count */}
                <span className="text-right text-muted-foreground">
                  {item.mentionCount}
                </span>

                {/* SOV bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        item.sovPercentage > userSovPercentage
                          ? "bg-red-400"
                          : "bg-[#1c4c8a]"
                      )}
                      style={{ width: `${item.sovPercentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {item.sovPercentage}%
                  </span>
                </div>

                {/* Diff vs user */}
                <div className="flex items-center justify-end gap-1">
                  {diff > 0 ? (
                    <span className="text-xs text-red-400 flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3" />
                      +{diff}%
                    </span>
                  ) : diff < 0 ? (
                    <span className="text-xs text-green-400 flex items-center gap-0.5">
                      <TrendingDown className="h-3 w-3" />
                      {diff}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Minus className="h-3 w-3" />
                      0%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
