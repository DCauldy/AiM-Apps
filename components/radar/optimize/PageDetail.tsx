"use client";

import { ExternalLink, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RadarAuditPage, ScoringBreakdown, AuditRecommendation } from "@/types/radar";

interface PageDetailProps {
  page: RadarAuditPage;
}

const SIGNAL_LABELS: Record<keyof ScoringBreakdown, string> = {
  structured_data: "Structured Data",
  content_depth: "Content Depth",
  authority_signals: "Authority Signals",
  crawlability: "Crawlability",
  citation_potential: "Citation Potential",
  internal_linking: "Internal Linking",
};

const SIGNAL_DESCRIPTIONS: Record<keyof ScoringBreakdown, string> = {
  structured_data: "Schema.org markup, FAQ sections, how-to structured data",
  content_depth: "Comprehensive coverage, word count, heading structure, expert language",
  authority_signals: "E-E-A-T indicators, author info, credentials, external citations",
  crawlability: "Page speed, proper heading hierarchy, meta tags, mobile-friendly",
  citation_potential: "Quotable stats, answer-ready content, definition blocks",
  internal_linking: "Links to related pages, hub page structure, breadcrumbs",
};

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function getBarColor(score: number): string {
  if (score >= 70) return "bg-green-400";
  if (score >= 40) return "bg-yellow-400";
  return "bg-red-400";
}

const PRIORITY_STYLES: Record<
  AuditRecommendation["priority"],
  { bg: string; text: string; label: string }
> = {
  high: { bg: "bg-red-500/10", text: "text-red-400", label: "High" },
  medium: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Medium" },
  low: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Low" },
};

export function PageDetail({ page }: PageDetailProps) {
  const signals = Object.entries(page.scoring_breakdown) as [
    keyof ScoringBreakdown,
    number,
  ][];

  // Sort signals by score (lowest first) for priority
  const sortedSignals = [...signals].sort((a, b) => a[1] - b[1]);

  // Sort recommendations by priority
  const sortedRecommendations = [...page.recommendations].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Page URL */}
      <div className="flex items-center gap-2">
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#e0a458] hover:underline flex items-center gap-1"
        >
          {page.url}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Signal breakdown */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Signal Scores
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedSignals.map(([signal, rawScore]) => {
            // Normalize from 0-10 to 0-100 for display
            const score = rawScore * 10;
            return (
              <div key={signal} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="text-muted-foreground"
                    title={SIGNAL_DESCRIPTIONS[signal]}
                  >
                    {SIGNAL_LABELS[signal]}
                  </span>
                  <span className={cn("font-semibold", getScoreColor(score))}>
                    {score}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      getBarColor(score)
                    )}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      {sortedRecommendations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Recommendations ({sortedRecommendations.length})
          </h4>
          <div className="space-y-2">
            {sortedRecommendations.map((rec, index) => {
              const priorityStyle = PRIORITY_STYLES[rec.priority];
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5"
                >
                  <div
                    className={cn(
                      "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                      priorityStyle.bg,
                      priorityStyle.text
                    )}
                  >
                    {priorityStyle.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {rec.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {rec.description}
                    </p>
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {SIGNAL_LABELS[rec.signal]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sortedRecommendations.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No specific recommendations for this page.
        </p>
      )}
    </div>
  );
}
