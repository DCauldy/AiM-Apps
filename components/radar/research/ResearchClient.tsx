"use client";

import { useState } from "react";
import { Sparkles, Trophy, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiscoverQueries } from "./DiscoverQueries";
import { CompetitorLeaderboard } from "./CompetitorLeaderboard";
import { GapAnalysis } from "./GapAnalysis";
import type { RadarQuery, RadarQuerySuggestion, RadarCompetitor, RadarResult } from "@/types/radar";

interface ResearchClientProps {
  queries: RadarQuery[];
  suggestions: RadarQuerySuggestion[];
  competitors: RadarCompetitor[];
  results?: RadarResult[];
}

const TABS = [
  { id: "discover", label: "Discover Queries", icon: Sparkles },
  { id: "leaderboard", label: "Competitor Leaderboard", icon: Trophy },
  { id: "gaps", label: "Gap Analysis", icon: GitCompareArrows },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ResearchClient({
  queries,
  suggestions: initialSuggestions,
  competitors,
  results = [],
}: ResearchClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("discover");
  const [suggestions, setSuggestions] = useState(initialSuggestions);

  const handleAddQuery = async (suggestion: RadarQuerySuggestion) => {
    try {
      await fetch("/api/apps/radar/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: [
            {
              query_text: suggestion.query_text,
              category: suggestion.category,
              source: suggestion.id ? "ai_generated" : "manual",
            },
          ],
        }),
      });

      // Update suggestion status locally
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestion.id ? { ...s, status: "added" as const } : s
        )
      );
    } catch {
      // Error handled silently
    }
  };

  const handleDismissSuggestion = async (suggestion: RadarQuerySuggestion) => {
    try {
      await fetch(`/api/apps/radar/queries/suggestions/${suggestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });

      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestion.id ? { ...s, status: "dismissed" as const } : s
        )
      );
    } catch {
      // Error handled silently
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-foreground">Research</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Discover queries, analyze competitors, and find visibility gaps.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-1 bg-card w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-[#e0a458]/10 text-[#e0a458]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "discover" && (
          <DiscoverQueries
            suggestions={suggestions.filter((s) => s.status === "suggested")}
            onAdd={handleAddQuery}
            onDismiss={handleDismissSuggestion}
          />
        )}

        {activeTab === "leaderboard" && (
          <CompetitorLeaderboard
            competitors={competitors}
            results={results}
          />
        )}

        {activeTab === "gaps" && (
          <GapAnalysis
            queries={queries}
            results={results}
            competitors={competitors}
          />
        )}
      </div>
    </div>
  );
}
