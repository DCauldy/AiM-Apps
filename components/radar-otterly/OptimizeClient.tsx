"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Loader2,
  Play,
  Sparkles,
  Target,
  TrendingDown,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  OtterlyAuditCheck,
  OtterlyBrandReport,
  OtterlyContentCheckDetail,
  OtterlyCrawlabilityCheckDetail,
} from "@/lib/radar-otterly/types";

// ============================================================
// Optimize tab — customer-facing helpful insights.
//
// Built for the agent who wants to know "what should I do this
// week?" not for an admin running tracking config. AiM-side ops
// surfaces (add competitors, add prompts, etc.) live in the admin
// queue at /admin/radar-requests.
//
// Sections in priority order:
//   1. Site health — latest content-check scores for the agent's
//      homepage, with fix-it copy for low categories.
//   2. Your wins — prompts ranking #1-#3 (reinforces value).
//   3. Quick wins — prompts close to winning + missing-but-volume.
//   4. Gaps — competitors winning, agent absent.
//   5. Check another page — slim audit form, secondary.
//   6. History — collapsed.
// ============================================================

interface PromptInsight {
  id: string;
  rank: number;
  prompt: string;
  brandMentions: number;
  brandRank: number | null;
  intentVolume: number;
  topCompetitor: string | null;
  topCompetitorRank: number | null;
}

interface OptimizeResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "no_matching_report"
    | "otterly_error";
  report?: OtterlyBrandReport;
  workspaceId?: string;
  defaultUrl?: string;
  siteHealth?: {
    audit: OtterlyContentCheckDetail | null;
  };
  wins?: PromptInsight[];
  quickWins?: PromptInsight[];
  gaps?: PromptInsight[];
  contentChecks?: OtterlyAuditCheck[];
  crawlabilityChecks?: OtterlyAuditCheck[];
  error?: { message: string; status: number };
}

export function RadarOptimizeClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/optimize", { cache: "no-store" });
      const payload = (await res.json()) as OptimizeResponse;
      if (!res.ok) throw new Error("Failed to load Optimize");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Optimize",
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

  if (loading && !data) return <OptimizeSkeleton />;
  if (!data) return <OptimizeSkeleton />;

  switch (data.status) {
    case "no_active_profile":
      return (
        <GateState
          title="Set up a profile first"
          body="Optimize shows what to work on this week to improve AI visibility. Pick or create a profile to continue."
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
          body="Head to the Dashboard to request setup. Once your data starts populating you'll see actionable insights here."
        />
      );
    case "otterly_error":
      return (
        <GateState
          title="Optimize is temporarily unavailable"
          body={`Couldn't load right now. ${data.error?.message ?? ""}`}
        />
      );
    case "ready":
      break;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Optimize</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What to work on this week to improve how AI engines see{" "}
            {data.report?.brand ?? "your brand"}.
          </p>
        </div>

        <SiteHealthSection
          audit={data.siteHealth?.audit ?? null}
          defaultUrl={data.defaultUrl ?? ""}
          workspaceId={data.workspaceId ?? ""}
          onRanAudit={load}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <WinsSection wins={data.wins ?? []} />
          <QuickWinsSection quickWins={data.quickWins ?? []} />
          <GapsSection gaps={data.gaps ?? []} />
        </div>

        <RunAuditSection
          workspaceId={data.workspaceId ?? ""}
          defaultUrl={data.defaultUrl ?? ""}
          onComplete={load}
        />

        <HistorySection
          contentChecks={data.contentChecks ?? []}
          crawlabilityChecks={data.crawlabilityChecks ?? []}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site health (lead section)
// ---------------------------------------------------------------------------

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

function SiteHealthSection({
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

// ---------------------------------------------------------------------------
// Insight columns: Wins / Quick wins / Gaps
// ---------------------------------------------------------------------------

function WinsSection({ wins }: { wins: PromptInsight[] }) {
  return (
    <InsightCard
      icon={<Trophy className="h-4 w-4 text-emerald-400" />}
      title={`Your wins (${wins.length})`}
      subtitle="Prompts where you're ranking #1-#3."
      empty="No top-3 wins yet — keep building topical authority."
    >
      <ul className="space-y-2">
        {wins.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 rounded shrink-0">
                #{p.brandRank}
              </span>
              <span className="text-foreground line-clamp-2">{p.prompt}</span>
            </div>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

function QuickWinsSection({ quickWins }: { quickWins: PromptInsight[] }) {
  return (
    <InsightCard
      icon={<Sparkles className="h-4 w-4 text-amber-400" />}
      title={`Quick wins (${quickWins.length})`}
      subtitle="Close to ranking — push more content here."
      empty="No quick wins flagged. Either you're crushing it or there's no intent volume yet."
    >
      <ul className="space-y-2">
        {quickWins.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">
                {p.brandRank != null ? `#${p.brandRank}` : "miss"}
              </span>
              <span className="text-foreground line-clamp-2">{p.prompt}</span>
            </div>
            {p.intentVolume > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5 ml-9">
                ~{p.intentVolume.toLocaleString()}/mo searches
              </div>
            )}
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

function GapsSection({ gaps }: { gaps: PromptInsight[] }) {
  return (
    <InsightCard
      icon={<TrendingDown className="h-4 w-4 text-rose-400" />}
      title={`Gaps (${gaps.length})`}
      subtitle="Competitors winning, you're absent. Study what they're doing."
      empty="No competitive gaps flagged — you're showing up everywhere."
    >
      <ul className="space-y-2">
        {gaps.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-rose-500 bg-rose-500/15 px-1.5 py-0.5 rounded shrink-0">
                miss
              </span>
              <span className="text-foreground line-clamp-2">{p.prompt}</span>
            </div>
            {p.topCompetitor && (
              <div className="text-[10px] text-muted-foreground mt-0.5 ml-9">
                {p.topCompetitor} winning at #{p.topCompetitorRank}
              </div>
            )}
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

function InsightCard({
  icon,
  title,
  subtitle,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </header>
      <div className="p-4 flex-1">
        {Array.isArray((children as React.ReactElement<{ children?: unknown[] }>)?.props?.children) &&
        ((children as React.ReactElement<{ children?: unknown[] }>).props.children?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground italic">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Run audit form (secondary)
// ---------------------------------------------------------------------------

const CRAWLER_OPTIONS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityCrawler",
  "GoogleBot",
] as const;

function RunAuditSection({
  workspaceId,
  defaultUrl,
  onComplete,
}: {
  workspaceId: string;
  defaultUrl: string;
  onComplete: () => void;
}) {
  const { addToast } = useToast();
  const [type, setType] = useState<"content" | "crawlability">("content");
  const [url, setUrl] = useState(defaultUrl);
  const [crawler, setCrawler] = useState<(typeof CRAWLER_OPTIONS)[number]>(
    "ChatGPT-User",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleRun = async () => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/apps/radar/optimize/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          workspaceId,
          url: url.trim(),
          crawlerIdentity: type === "content" ? crawler : undefined,
        }),
      });
      const payload = await res.json();
      if (payload.status === "created") {
        addToast({
          title: "Audit started",
          description: `${type === "content" ? "Content check" : "Crawlability check"} running — results in 30-90s.`,
        });
        onComplete();
      } else {
        throw new Error(payload.error?.message ?? "Audit dispatch failed");
      }
    } catch (e) {
      addToast({
        title: "Couldn't start audit",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          Check another page
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Audit any URL — your blog posts, listing pages, team page, etc.
        </p>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="content">Content check</option>
            <option value="crawlability">Crawlability check</option>
          </select>
        </div>
        {type === "content" && (
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">
              Crawler
            </label>
            <select
              value={crawler}
              onChange={(e) =>
                setCrawler(e.target.value as (typeof CRAWLER_OPTIONS)[number])
              }
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CRAWLER_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={handleRun}
          disabled={submitting || !url.trim() || !workspaceId}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90 disabled:opacity-50 h-[38px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run audit
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// History (collapsed)
// ---------------------------------------------------------------------------

function HistorySection({
  contentChecks,
  crawlabilityChecks,
}: {
  contentChecks: OtterlyAuditCheck[];
  crawlabilityChecks: OtterlyAuditCheck[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"content" | "crawlability">("content");

  const total = contentChecks.length + crawlabilityChecks.length;
  if (total === 0) return null;

  const list = tab === "content" ? contentChecks : crawlabilityChecks;
  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
  );

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold">Audit history ({total})</h2>
      </button>
      {open && (
        <>
          <div className="px-5 pb-3 flex items-center gap-1">
            {(["content", "crawlability"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md transition-colors",
                  tab === k
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "content" ? "Content" : "Crawlability"} (
                {k === "content"
                  ? contentChecks.length
                  : crawlabilityChecks.length}
                )
              </button>
            ))}
          </div>
          {sorted.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No {tab} audits yet.
            </div>
          ) : (
            <ul className="border-t border-border divide-y divide-border">
              {sorted.map((audit) => (
                <AuditRow key={audit.id} audit={audit} type={tab} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function AuditRow({
  audit,
  type,
}: {
  audit: OtterlyAuditCheck;
  type: "content" | "crawlability";
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<
    OtterlyContentCheckDetail | OtterlyCrawlabilityCheckDetail | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/apps/radar/optimize/audit/${type}/${audit.id}`,
        { cache: "no-store" },
      );
      const payload = await res.json();
      if (payload.status !== "ready" || !payload.audit) {
        throw new Error(payload.error?.message ?? "Detail unavailable");
      }
      setDetail(payload.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [audit.id, type]);

  useEffect(() => {
    if (!open || detail) return;
    fetchDetail();
  }, [open, detail, fetchDetail]);

  useEffect(() => {
    if (!open || !detail) return;
    const status = detail.status;
    if (status === "completed" || status === "finished" || status === "failed") {
      return;
    }
    const id = setInterval(fetchDetail, 4_000);
    return () => clearInterval(id);
  }, [open, detail, fetchDetail]);

  const createdLabel = new Date(audit.createdDate).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const contentDetail =
    type === "content" && detail
      ? (detail as OtterlyContentCheckDetail)
      : null;
  const overallScore =
    contentDetail?.structuralAnalysis?.overallScore != null
      ? Math.round(contentDetail.structuralAnalysis.overallScore)
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{audit.url}</div>
          <div className="text-[11px] text-muted-foreground">
            {createdLabel}
          </div>
        </div>
        {overallScore != null && (
          <span
            className={cn(
              "text-xs font-medium tabular-nums px-2 py-0.5 rounded shrink-0",
              overallScore >= 80
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : overallScore >= 60
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            )}
          >
            {overallScore}
          </span>
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border bg-muted/20">
          {loading && !detail && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading detail…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 mt-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          {detail && type === "content" && (
            <ContentCheckDetailView detail={detail as OtterlyContentCheckDetail} />
          )}
          {detail && type === "crawlability" && (
            <CrawlabilityCheckDetailView
              detail={detail as OtterlyCrawlabilityCheckDetail}
            />
          )}
        </div>
      )}
    </li>
  );
}

function ContentCheckDetailView({
  detail,
}: {
  detail: OtterlyContentCheckDetail;
}) {
  const status = detail.status;
  if (status !== "completed" && status !== "finished") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Audit in progress ({status}) — polling every 4s.
      </div>
    );
  }
  const sa = detail.structuralAnalysis;
  if (!sa) {
    return (
      <div className="text-xs text-muted-foreground py-4 italic">
        Audit completed but no structural analysis returned.
      </div>
    );
  }
  return (
    <div className="pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { key: "metadata", label: "Metadata" },
            { key: "technical", label: "Technical" },
            { key: "structure", label: "Structure" },
            { key: "content", label: "Content" },
          ] as const
        ).map((c) => {
          const score = sa.categoryScores[c.key];
          return (
            <div
              key={c.key}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  score >= 80
                    ? "text-emerald-500"
                    : score >= 60
                      ? "text-amber-500"
                      : "text-rose-500",
                )}
              >
                {Math.round(score)}
              </div>
            </div>
          );
        })}
      </div>
      {detail.dynamicContent && (
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Dynamic content score
              </div>
              <div className="text-sm">
                {Math.round(detail.dynamicContent.score)}/100 ·{" "}
                {detail.dynamicContent.differenceDescription}
              </div>
            </div>
            {detail.dynamicContent.isPotentiallyBlocked && (
              <span className="text-[10px] px-2 py-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 shrink-0">
                Possibly blocked
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CrawlabilityCheckDetailView({
  detail,
}: {
  detail: OtterlyCrawlabilityCheckDetail;
}) {
  const status = detail.status;
  if (status !== "completed" && status !== "finished") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Audit in progress ({status}) — polling every 4s.
      </div>
    );
  }
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 text-xs text-emerald-500 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Crawlability check completed.
      </div>
      <pre className="text-[10px] bg-background border border-border rounded p-3 overflow-auto max-h-64 font-mono text-muted-foreground">
        {JSON.stringify(detail.results ?? {}, null, 2)}
      </pre>
      <p className="text-[11px] text-muted-foreground mt-2 italic">
        Crawlability response shape will be typed once we have a finished run
        to inspect.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton + gate
// ---------------------------------------------------------------------------

function OptimizeSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-44 bg-card border border-border rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
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
            <ExternalLink className="h-6 w-6" />
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
