"use client";

import { useState } from "react";
import { Loader2, Play, Target } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { OtterlyContentCheckDetail } from "@/lib/radar-otterly/types";

// Site health section — leads the Optimize tab.
//
// Renders the latest content-check on the agent's homepage with per-
// category fix-it copy. If no audit exists yet, shows a one-click
// "Audit homepage" CTA that fires a fresh content check.

const CATEGORY_FIX_COPY: Record<
  string,
  { low: string; mid: string; high: string }
> = {
  metadata: {
    low: "Add a clear page title, meta description, Open Graph tags, and structured data (JSON-LD) so AI engines can confidently summarize this page.",
    mid: "Polish your meta description and add JSON-LD structured data for the strongest AI snippet quality.",
    high: "Your metadata is in great shape.",
  },
  technical: {
    low: "Fix mobile-friendly issues, validate your HTML, and check robots.txt allows AI crawlers (ChatGPT-User, PerplexityCrawler, etc.).",
    mid: "Tighten up HTML validation and confirm your robots.txt explicitly allows the AI crawler user-agents.",
    high: "Technically sound — AI crawlers can reach and parse your page.",
  },
  structure: {
    low: "Add a clear H1→H2→H3 heading hierarchy, use bullet lists for scannable content, and apply semantic HTML (<article>, <nav>, <main>).",
    mid: "Add more lists and improve heading hierarchy — AI engines lean on structure to pick out answers.",
    high: "Well-structured page that AI can navigate easily.",
  },
  content: {
    low: "Add richer content: bullet lists, comparison tables, FAQs, and varied content types (images with alt text, embedded video).",
    mid: "Expand content variety — FAQs, tables, and comparison sections perform especially well for AI answers.",
    high: "Rich, varied content that gives AI plenty to quote.",
  },
};

function copyForScore(category: keyof typeof CATEGORY_FIX_COPY, score: number) {
  const c = CATEGORY_FIX_COPY[category];
  if (!c) return "";
  if (score >= 80) return c.high;
  if (score >= 60) return c.mid;
  return c.low;
}

export function SiteHealthSection({
  audit,
  defaultUrl,
  workspaceId,
  onRanAudit,
}: {
  audit: OtterlyContentCheckDetail | null;
  defaultUrl: string;
  workspaceId: string;
  onRanAudit: () => void;
}) {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const runOnHomepage = async () => {
    if (!defaultUrl || !workspaceId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/apps/radar/optimize/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "content",
          workspaceId,
          url: defaultUrl,
          crawlerIdentity: "ChatGPT-User",
        }),
      });
      const payload = await res.json();
      if (payload.status !== "created") {
        throw new Error(payload.error?.message ?? "Audit dispatch failed");
      }
      addToast({
        title: "Site audit started",
        description: "Results land in 30-90s — refreshing.",
      });
      onRanAudit();
    } catch (e) {
      addToast({
        title: "Couldn't start site audit",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!audit) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-sky-400" />
              Site health
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Run an audit on your homepage to see how AI-ready it is.
            </p>
          </div>
          <button
            type="button"
            onClick={runOnHomepage}
            disabled={submitting || !defaultUrl || !workspaceId}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Audit homepage
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  const sa = audit.structuralAnalysis;
  if (audit.status !== "completed" && audit.status !== "finished") {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Site audit in progress — results in 30-90s.
        </div>
      </section>
    );
  }
  if (!sa) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Audit completed but returned no structural analysis.
        </p>
      </section>
    );
  }

  const overall = Math.round(sa.overallScore);
  const categories: Array<{
    key: keyof typeof CATEGORY_FIX_COPY;
    label: string;
    score: number;
  }> = [
    { key: "metadata", label: "Metadata", score: sa.categoryScores.metadata },
    { key: "technical", label: "Technical", score: sa.categoryScores.technical },
    {
      key: "structure",
      label: "Structure",
      score: sa.categoryScores.structure,
    },
    { key: "content", label: "Content", score: sa.categoryScores.content },
  ];

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="border-b border-border px-5 py-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-sky-400" />
            Site health
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {audit.url} ·{" "}
            {new Date(audit.createdDate).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn(
              "text-3xl font-bold tabular-nums",
              overall >= 80
                ? "text-emerald-500"
                : overall >= 60
                  ? "text-amber-500"
                  : "text-rose-500",
            )}
          >
            {overall}
            <span className="text-sm text-muted-foreground font-normal">
              /100
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            overall score
          </div>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {categories.map((c) => {
          const score = Math.round(c.score);
          return (
            <li key={c.key} className="px-5 py-3 flex items-start gap-4">
              <div className="shrink-0 w-16 text-right">
                <div
                  className={cn(
                    "text-xl font-semibold tabular-nums",
                    score >= 80
                      ? "text-emerald-500"
                      : score >= 60
                        ? "text-amber-500"
                        : "text-rose-500",
                  )}
                >
                  {score}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </div>
              </div>
              <p className="text-sm text-foreground/90 flex-1 leading-relaxed">
                {copyForScore(c.key, c.score)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
