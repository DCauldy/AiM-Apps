"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { WriteAboutThisLink } from "@/components/radar-otterly/CrossAppActions";
import type {
  OtterlyBrandReport,
  OtterlyCitation,
  OtterlyPromptDetail,
  OtterlyPromptSummary,
} from "@/lib/radar-otterly/types";

// ============================================================
// Research tab — prompts × outcomes drill-down.
//
// List of every prompt tracked in the brand report with summary
// metrics (mentions, intent volume). Click a row → expanded panel
// shows per-prompt detail (lazy-loaded): brand rank with sentiment
// breakdown per brand, domain category mix, and URLs that AI
// engines cited when answering this prompt.
//
// Verbatim AI response text isn't on the public API, so this view
// gives ops + customer everything Otterly will share short of the
// raw chatbot output.
// ============================================================

type ResearchStatus =
  | "ready"
  | "no_active_profile"
  | "no_website_url"
  | "no_matching_report"
  | "otterly_error";

interface ResearchResponse {
  status: ResearchStatus;
  report?: OtterlyBrandReport;
  prompts?: OtterlyPromptSummary[];
  citations?: OtterlyCitation[];
  error?: { message: string; status: number };
}

export function RadarResearchClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/research", { cache: "no-store" });
      const payload = (await res.json()) as ResearchResponse;
      if (!res.ok) throw new Error("Failed to load research");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load research",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <ResearchSkeleton />;
  if (!data) return <ResearchSkeleton />;

  switch (data.status) {
    case "no_active_profile":
      return (
        <GateState
          title="Set up a profile first"
          body="Research shows how AI engines respond to prompts about your brand. Pick or create a profile to continue."
        />
      );
    case "no_website_url":
      return (
        <GateState
          title="Add your website URL"
          body="Add a Website URL to your active profile so we can match it to your AI tracking setup."
        />
      );
    case "no_matching_report":
      return (
        <GateState
          title="Tracking isn't set up yet"
          body="Head to the Dashboard to request setup, then check back here once your data starts populating."
        />
      );
    case "otterly_error":
      return (
        <GateState
          title="Research is temporarily unavailable"
          body={`Couldn't pull prompt data right now. ${data.error?.message ?? ""}`}
        />
      );
    case "ready":
      break;
  }

  const prompts = data.prompts ?? [];
  const citations = data.citations ?? [];

  // Client-side search across prompt text. Tiny dataset (typically
  // <50 prompts) so no fuzzy lib needed.
  const q = query.toLowerCase().trim();
  const filtered = q
    ? prompts.filter((p) => p.prompt.toLowerCase().includes(q))
    : prompts;

  // Sort by rank ascending (Otterly ranks prompts by some internal
  // signal — keep the natural order).
  const sorted = [...filtered].sort((a, b) => a.rank - b.rank);

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <Header report={data.report ?? null} prompts={prompts} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
            {q ? "No prompts match your search." : "No prompts tracked yet."}
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
            {sorted.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                citations={citations}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  report,
  prompts,
}: {
  report: OtterlyBrandReport | null;
  prompts: OtterlyPromptSummary[];
}) {
  const totalMentions = prompts.reduce((s, p) => s + (p.brandMentions ?? 0), 0);
  const totalCitations = prompts.reduce(
    (s, p) => s + (p.domainMentions ?? 0),
    0,
  );
  const promptsWithMentions = prompts.filter(
    (p) => (p.brandMentions ?? 0) > 0,
  ).length;
  const coverageRate = prompts.length
    ? Math.round((promptsWithMentions / prompts.length) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Research</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {report?.brand ?? "Your brand"} · {prompts.length} prompts tracked
            across AI engines · last 30 days
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Stat label="Mention rate" value={`${coverageRate}%`} accent="text-emerald-400" />
          <Stat label="Total mentions" value={totalMentions} accent="text-sky-400" />
          <Stat label="Total citations" value={totalCitations} accent="text-amber-400" />
        </div>
      </div>
      <TrackedEnginesBar />
    </div>
  );
}

// Engines covered for US accounts. Hardcoded because Otterly's
// /v1/engines endpoint returns the same list per country, and per-
// engine attribution data isn't exposed on the public API at our
// tier — so the most truthful surface is "here's what's being
// tracked" rather than fake per-engine numbers.
const TRACKED_ENGINES = [
  "ChatGPT",
  "Perplexity",
  "Gemini",
  "Google AI Mode",
  "Copilot",
  "Google",
];

function TrackedEnginesBar() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-wide">Engines tracked</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {TRACKED_ENGINES.map((e) => (
          <span
            key={e}
            className="px-1.5 py-0.5 rounded bg-muted text-foreground/80"
          >
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-1.5">
      <div className={cn("text-base font-semibold tabular-nums", accent)}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt row — collapsed summary + expanded detail
// ---------------------------------------------------------------------------

function PromptRow({
  prompt,
  citations,
}: {
  prompt: OtterlyPromptSummary;
  citations: OtterlyCitation[];
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OtterlyPromptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/apps/radar/research/${prompt.id}`, {
          cache: "no-store",
        });
        const payload = await res.json();
        if (payload.status !== "ready" || !payload.detail) {
          throw new Error(payload.error?.message ?? "Detail unavailable");
        }
        setDetail(payload.detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Per-prompt citations: filter the global citations list by prompt
  // membership. Otterly populates `prompts: [id, id, ...]` on each
  // citation row, so we can stitch this without an extra round trip.
  const promptCitations = citations
    .filter((c) => c.prompts.includes(prompt.id))
    .sort((a, b) => b.citations - a.citations);

  const mentioned = (prompt.brandMentions ?? 0) > 0;

  return (
    <li>
      {/* Row uses a flex container with the toggle as a button and
          the WriteAboutThisLink as a sibling. Can't nest <a> inside
          <button> (invalid HTML / broken a11y) so they're peers,
          with the toggle button taking the flex-1 width. */}
      <div className="flex items-start gap-2 hover:bg-muted/40 transition-colors">
        <button
          type="button"
          onClick={handleToggle}
          className="flex-1 flex items-start gap-3 px-4 py-3 text-left min-w-0"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                #{prompt.rank}
              </span>
              <span className="text-sm text-foreground">{prompt.prompt}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  mentioned ? "text-emerald-500" : "text-muted-foreground",
                )}
              >
                <Sparkles className="h-3 w-3" />
                {prompt.brandMentions} brand mention
                {prompt.brandMentions === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {prompt.domainMentions} citation
                {prompt.domainMentions === 1 ? "" : "s"}
              </span>
              {prompt.volume > 0 && (
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {prompt.volume.toLocaleString()}/mo intent
                </span>
              )}
              {prompt.tags?.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  {prompt.tags.join(", ")}
                </span>
              )}
            </div>
          </div>
        </button>
        <WriteAboutThisLink prompt={prompt.prompt} className="mt-3 mr-4" />
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 bg-muted/20 border-t border-border space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading detail…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {detail && (
            <>
              <BrandRankPanel rows={detail.brandRank} />
              <DomainCategoriesPanel rows={detail.domainCategories} />
            </>
          )}

          <CitationsPanel citations={promptCitations} />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Detail panels
// ---------------------------------------------------------------------------

function BrandRankPanel({
  rows,
}: {
  rows: import("@/lib/radar-otterly/types").OtterlyPromptBrandRow[];
}) {
  if (rows.length === 0) {
    return (
      <Section title="Brand rank">
        <div className="text-xs text-muted-foreground italic">
          No brands ranked for this prompt yet.
        </div>
      </Section>
    );
  }
  return (
    <Section title={`Brand rank (${rows.length})`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="font-medium py-2 pl-2">Brand</th>
            <th className="font-medium py-2 text-right">Rank</th>
            <th className="font-medium py-2 text-right">Mentions</th>
            <th className="font-medium py-2 text-right">Coverage</th>
            <th className="font-medium py-2 text-right pr-2">NSS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.brand}>
              <td className="py-1.5 pl-2 text-foreground truncate max-w-[200px]">
                {r.brand}
              </td>
              <td className="py-1.5 text-right tabular-nums">#{r.rank}</td>
              <td className="py-1.5 text-right tabular-nums">{r.mentions}</td>
              <td className="py-1.5 text-right tabular-nums">
                {Math.round(r.brandCoverage)}%
              </td>
              <td
                className={cn(
                  "py-1.5 text-right tabular-nums pr-2",
                  r.sentiment && r.sentiment.nss > 0
                    ? "text-emerald-500"
                    : r.sentiment && r.sentiment.nss < 0
                      ? "text-rose-500"
                      : "text-muted-foreground",
                )}
              >
                {r.sentiment
                  ? r.sentiment.nss > 0
                    ? `+${r.sentiment.nss}`
                    : r.sentiment.nss
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function DomainCategoriesPanel({
  rows,
}: {
  rows: import("@/lib/radar-otterly/types").OtterlyDomainCategoryRow[];
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) {
    return null;
  }
  return (
    <Section title="Source type mix">
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const pct = Math.round((r.value / total) * 100);
          const accent =
            r.category === "Brand"
              ? "bg-emerald-500"
              : r.category === "Blogs/Personal Sites"
                ? "bg-sky-500"
                : "bg-muted-foreground/40";
          return (
            <li key={r.category} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="text-foreground">{r.category}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.value} · {pct}%
                </span>
              </div>
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full", accent)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function CitationsPanel({ citations }: { citations: OtterlyCitation[] }) {
  return (
    <Section title={`Cited sources (${citations.length})`}>
      {citations.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No source citations attributed to this prompt yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {citations.slice(0, 12).map((c) => (
            <li key={c.url} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0",
                  c.domainCategory === "Brand"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {c.domainCategory}
              </span>
              <div className="flex-1 min-w-0">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:text-primary truncate block"
                >
                  {c.title || c.domain}
                </a>
                <div className="text-[10px] text-muted-foreground">
                  {c.domain} · {c.citations} citation
                  {c.citations === 1 ? "" : "s"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton + Gate
// ---------------------------------------------------------------------------

function ResearchSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-9 w-full bg-muted rounded animate-pulse" />
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GateState({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
