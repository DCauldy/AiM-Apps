"use client";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { RadarAudit, RadarAuditPage, ScoringBreakdown } from "@/types/radar";

interface AuditSummaryProps {
  audit: RadarAudit;
  pages: RadarAuditPage[];
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
  structured_data: "Schema markup, FAQ sections, structured content",
  content_depth: "Comprehensive coverage, expert language, depth",
  authority_signals: "E-E-A-T signals, citations, credentials",
  crawlability: "Page speed, headings, meta tags, accessibility",
  citation_potential: "Answer capsules, quotable content, statistics",
  internal_linking: "Internal links, hub pages, topic clusters",
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

function getScoreGradient(score: number): string {
  if (score >= 70) return "from-green-500/20 to-green-500/5";
  if (score >= 40) return "from-yellow-500/20 to-yellow-500/5";
  return "from-red-500/20 to-red-500/5";
}

export function AuditSummary({ audit, pages }: AuditSummaryProps) {
  const score = audit.overall_score ?? 0;

  // Compute average signal scores from pages (0-10 scale)
  const signalAverages: ScoringBreakdown = (() => {
    const signals: ScoringBreakdown = {
      structured_data: 0,
      content_depth: 0,
      authority_signals: 0,
      crawlability: 0,
      citation_potential: 0,
      internal_linking: 0,
    };
    if (pages.length === 0) return signals;

    for (const page of pages) {
      const b = page.scoring_breakdown;
      signals.structured_data += b.structured_data;
      signals.content_depth += b.content_depth;
      signals.authority_signals += b.authority_signals;
      signals.crawlability += b.crawlability;
      signals.citation_potential += b.citation_potential;
      signals.internal_linking += b.internal_linking;
    }

    const count = pages.length;
    signals.structured_data = Math.round(signals.structured_data / count);
    signals.content_depth = Math.round(signals.content_depth / count);
    signals.authority_signals = Math.round(signals.authority_signals / count);
    signals.crawlability = Math.round(signals.crawlability / count);
    signals.citation_potential = Math.round(signals.citation_potential / count);
    signals.internal_linking = Math.round(signals.internal_linking / count);

    return signals;
  })();

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6",
        `bg-gradient-to-br ${getScoreGradient(score)}`
      )}
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Score circle */}
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-border"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className={getScoreColor(score).replace("text-", "stroke-")}
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 - (score / 100) * 2 * Math.PI * 42}
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-2xl font-bold", getScoreColor(score))}>
                {score}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                / 100
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              AI-Readiness Score
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{audit.pages_found} pages found</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>{audit.pages_analyzed} analyzed</span>
              {audit.completed_at && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{formatDate(audit.completed_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Signal breakdown bars */}
        <div className="flex-1 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Signal Breakdown
          </h4>
          {(Object.keys(SIGNAL_LABELS) as Array<keyof ScoringBreakdown>).map(
            (signal) => {
              const value = signalAverages[signal];
              // Signals are 0-10; normalize to 0-100 for display
              const displayValue = value * 10;
              return (
                <div key={signal} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground" title={SIGNAL_DESCRIPTIONS[signal]}>
                      {SIGNAL_LABELS[signal]}
                    </span>
                    <span className={cn("font-medium", getScoreColor(displayValue))}>
                      {displayValue > 0 ? displayValue : "--"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        getBarColor(displayValue)
                      )}
                      style={{ width: displayValue > 0 ? `${displayValue}%` : "0%" }}
                    />
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
