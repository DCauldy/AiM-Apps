"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageDetail } from "./PageDetail";
import type { RadarAuditPage, PageType, ScoringBreakdown } from "@/types/radar";

interface PageListProps {
  pages: RadarAuditPage[];
}

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  homepage: "Homepage",
  service: "Service Pages",
  about: "About",
  neighborhood: "Neighborhood Pages",
  blog: "Blog Posts",
  listing: "Listings",
  other: "Other",
};

const PAGE_TYPE_ORDER: PageType[] = [
  "homepage",
  "service",
  "about",
  "neighborhood",
  "other",
  "listing",
  "blog",
];

function getScoreColor(score: number | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBg(score: number | undefined): string {
  if (score == null) return "bg-muted";
  if (score >= 70) return "bg-green-500/10";
  if (score >= 40) return "bg-yellow-500/10";
  return "bg-red-500/10";
}

function getWorstSignal(breakdown: ScoringBreakdown): { signal: string; score: number } | null {
  const entries = Object.entries(breakdown) as [keyof ScoringBreakdown, number][];
  if (entries.length === 0) return null;

  const SIGNAL_LABELS: Record<keyof ScoringBreakdown, string> = {
    structured_data: "Structured Data",
    content_depth: "Content Depth",
    authority_signals: "Authority",
    crawlability: "Crawlability",
    citation_potential: "Citations",
    internal_linking: "Linking",
  };

  const worst = entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min));
  return { signal: SIGNAL_LABELS[worst[0]], score: worst[1] };
}

export function PageList({ pages }: PageListProps) {
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  // Group pages by type, sorted by priority order
  const groupedPages = useMemo(() => {
    const groups = new Map<PageType, RadarAuditPage[]>();

    for (const page of pages) {
      const type = page.page_type;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(page);
    }

    // Sort each group by score (lowest first for priority)
    for (const group of groups.values()) {
      group.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    }

    return PAGE_TYPE_ORDER
      .filter((type) => groups.has(type))
      .map((type) => ({
        type,
        label: PAGE_TYPE_LABELS[type],
        pages: groups.get(type)!,
      }));
  }, [pages]);

  if (pages.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No pages analyzed yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Pages ({pages.length})
      </h3>

      {groupedPages.map((group) => (
        <div key={group.type} className="space-y-1.5">
          <h4 className="text-xs font-semibold text-foreground mb-2">
            {group.label}{" "}
            <span className="text-muted-foreground font-normal">
              ({group.pages.length})
            </span>
          </h4>

          {group.pages.map((page) => {
            const isExpanded = expandedPage === page.id;
            const worstSignal = getWorstSignal(page.scoring_breakdown);

            return (
              <div
                key={page.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Row */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPage(isExpanded ? null : page.id)
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                >
                  {/* Score (normalized 0-100) */}
                  <div
                    className={cn(
                      "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold",
                      getScoreBg(page.score != null ? page.score * 10 : undefined),
                      getScoreColor(page.score != null ? page.score * 10 : undefined)
                    )}
                  >
                    {page.score != null ? Math.round(page.score * 10) : "--"}
                  </div>

                  {/* Page info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {page.title || page.url}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {page.url}
                      </span>
                      {worstSignal && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            worstSignal.score * 10 < 40
                              ? "bg-red-500/10 text-red-400"
                              : "bg-yellow-500/10 text-yellow-400"
                          )}
                        >
                          {worstSignal.signal}: {worstSignal.score * 10}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand icon */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <PageDetail page={page} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
