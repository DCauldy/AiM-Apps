"use client";

import { useState } from "react";
import { Plus, X, Check, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RadarQuerySuggestion } from "@/types/radar";

interface DiscoverQueriesProps {
  suggestions: RadarQuerySuggestion[];
  onAdd: (suggestion: RadarQuerySuggestion) => void;
  onDismiss: (suggestion: RadarQuerySuggestion) => void;
}

export function DiscoverQueries({
  suggestions,
  onAdd,
  onDismiss,
}: DiscoverQueriesProps) {
  const [manualQuery, setManualQuery] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const handleAddManual = async () => {
    if (!manualQuery.trim()) return;
    setAddingManual(true);

    const manualSuggestion: RadarQuerySuggestion = {
      id: crypto.randomUUID(),
      user_id: "",
      query_text: manualQuery.trim(),
      status: "suggested",
      created_at: new Date().toISOString(),
    };

    await onAdd(manualSuggestion);
    setManualQuery("");
    setAddingManual(false);
  };

  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddManual();
    }
  };

  return (
    <div className="space-y-6">
      {/* Manual query entry */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Add a Query Manually
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Type a query you want Radar to monitor across AI engines.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder="e.g., Best real estate agent in Austin"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#e0a458]/50 focus:border-[#e0a458]"
            />
          </div>
          <Button
            onClick={handleAddManual}
            disabled={!manualQuery.trim() || addingManual}
            className="bg-[#e0a458] hover:bg-[#c88d3e] text-white shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* AI suggestions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[#e0a458]" />
          <h3 className="text-sm font-semibold text-foreground">
            AI Suggestions
          </h3>
          <span className="text-xs text-muted-foreground">
            ({suggestions.length})
          </span>
        </div>

        {suggestions.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-dashed border-border">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No new suggestions. Check back after your next monitoring run.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {suggestion.query_text}
                  </p>
                  {suggestion.category && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[#1c4c8a]/20 text-blue-300">
                      {suggestion.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => onAdd(suggestion)}
                    className="bg-[#e0a458] hover:bg-[#c88d3e] text-white h-8 px-3"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismiss(suggestion)}
                    className="text-muted-foreground hover:text-destructive h-8 px-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
