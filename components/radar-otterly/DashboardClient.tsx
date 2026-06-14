"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { RadarOtterlyDashboardSkeleton } from "./DashboardSkeleton";
import type {
  OtterlyAccountInfo,
  OtterlyBrandReport,
  OtterlyBrandReportStats,
  OtterlyCompetitorBrandMention,
  OtterlyDetectedBrand,
} from "@/lib/radar-otterly/types";

// ============================================================
// Radar — Otterly-backed AI visibility dashboard for the active
// profile. Auto-discovers the matching brand report by hostname,
// renders the 6-tile KPI strip + competitor table + landscape
// leaderboard + cited-sources leaderboard + actionable
// recommendations.
//
// Five render states (driven by the /api/apps/radar/dashboard
// response status):
//   - loading              → skeleton
//   - ready                → full dashboard
//   - no_active_profile    → "set up a profile first" gate
//   - no_website_url       → "add website_url to your profile" gate
//   - no_matching_report   → "create a brand report in Otterly with
//                            brandDomain = <hostname>" gate
//   - otterly_error        → surface the Otterly error message
// ============================================================

interface DashboardResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "pending_setup"
    | "no_matching_report"
    | "otterly_error";
  profile?: { id: string; website_url: string; hostname: string };
  account?: OtterlyAccountInfo;
  report?: OtterlyBrandReport;
  stats?: OtterlyBrandReportStats;
  hostname?: string;
  pendingRequest?: {
    id: string;
    hostname: string;
    status: "pending" | "researching" | "ready_for_ops";
    requested_at: string;
  };
  error?: { message: string; status: number };
}

export function RadarOtterlyDashboardClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/radar/dashboard", {
        cache: "no-store",
      });
      const payload = (await res.json()) as DashboardResponse;
      if (!res.ok) throw new Error("Failed to load dashboard");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Radar",
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

  if (loading) return <RadarOtterlyDashboardSkeleton />;
  if (!data) return <RadarOtterlyDashboardSkeleton />;

  switch (data.status) {
    case "no_active_profile":
      return (
        <GateState
          title="Set up a profile first"
          body="Radar shows your AI search visibility for the brand on your active profile. Create or pick a profile to continue."
          ctaLabel="Open profiles"
          ctaHref="/apps/profile"
        />
      );
    case "no_website_url":
      return (
        <GateState
          title="Add your website URL"
          body="Radar tracks how your brand shows up across ChatGPT, Perplexity, Gemini, and other AI search engines. Add a Website URL to your active profile to get started."
          ctaLabel="Edit profile"
          ctaHref="/apps/profile"
        />
      );
    case "pending_setup":
      return <PendingSetup pending={data.pendingRequest ?? null} />;
    case "no_matching_report":
      return <FirstRunSetup hostname={data.hostname ?? null} />;
    case "otterly_error":
      return (
        <GateState
          title="Radar is temporarily unavailable"
          body={
            <>
              We hit a snag pulling your visibility data. Try again in a
              moment — if it keeps happening, ping AiM support.
              <span className="block mt-3 text-[10px] text-muted-foreground/70 font-mono">
                ref: {data.error?.status} {data.error?.message}
              </span>
            </>
          }
          ctaLabel="Try again"
          ctaHref="/apps/radar"
        />
      );
    case "ready":
      return <ReadyDashboard data={data} />;
  }
}

// ---------------------------------------------------------------------------
// Ready dashboard
// ---------------------------------------------------------------------------

function ReadyDashboard({ data }: { data: DashboardResponse }) {
  const report = data.report!;
  const stats = data.stats!;
  const mainBrand =
    stats.competitorBrandsAnalysis.brandMentions.find((b) => b.isMainBrand) ??
    null;

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Header report={report} stats={stats} />
        <KpiStrip stats={stats} mainBrand={mainBrand} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <CompetitorsPanel
              competitors={stats.competitorBrandsAnalysis.brandMentions}
            />
            <DetectedBrandsPanel brands={stats.detectedBrands} />
          </div>
          <div className="space-y-5">
            <TopCitedSourcesPanel
              domains={
                stats.allBrandsAnalysis.domainCoverageHistory[0]?.domains ?? []
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — brand name + time range chip + account/trial banner
// ---------------------------------------------------------------------------

function Header({
  report,
  stats,
}: {
  report: OtterlyBrandReport;
  stats: OtterlyBrandReportStats;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {report.brand}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <Globe className="h-3.5 w-3.5" />
            <span>{report.brandDomain}</span>
            <span>·</span>
            <span>Tracking {report.countries.join(", ").toUpperCase()}</span>
            <span>·</span>
            <span>{stats.totalPrompts} prompts across AI engines</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          Last 30 days
        </span>
      </div>
      {/* Subscription / trial-expiry banner intentionally absent —
          that's data about OUR vendor account, not the subscriber's.
          Admin-only surface for it should live in /admin. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI strip — six headline tiles
// ---------------------------------------------------------------------------

function KpiStrip({
  stats,
  mainBrand,
}: {
  stats: OtterlyBrandReportStats;
  mainBrand: OtterlyCompetitorBrandMention | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiTile
        label="Share of Voice"
        value={`${stats.summary.shareOfVoice}%`}
        Icon={TrendingUp}
        accent="text-emerald-400"
      />
      {/* Brand Coverage = % of tracked prompts that mention the brand
          at all (any engine). Distinct from Citation Rate (which is
          domain-based — % where caldwellrg.com appears as a cited
          source). Replaces Otterly's opaque Visibility Score composite
          which customers couldn't reason about. */}
      <KpiTile
        label="Brand Coverage"
        value={
          mainBrand?.brandCoverage != null
            ? `${Math.round(mainBrand.brandCoverage)}%`
            : stats.summary.brandCoverage != null
              ? `${Math.round(stats.summary.brandCoverage)}%`
              : "—"
        }
        Icon={Eye}
        accent="text-sky-400"
      />
      <KpiTile
        label="Average Rank"
        value={
          stats.summary.averageRank != null
            ? `#${stats.summary.averageRank}`
            : "—"
        }
        Icon={Trophy}
        accent="text-amber-400"
      />
      <KpiTile
        label="Net Sentiment"
        value={
          mainBrand?.sentiment
            ? mainBrand.sentiment.nss > 0
              ? `+${mainBrand.sentiment.nss}`
              : mainBrand.sentiment.nss
            : "—"
        }
        Icon={Sparkles}
        accent={
          mainBrand?.sentiment && mainBrand.sentiment.nss >= 0
            ? "text-emerald-400"
            : "text-rose-400"
        }
      />
      <KpiTile
        label="Total Mentions"
        value={stats.summary.totalMentions.toLocaleString()}
        Icon={MessageSquare}
        accent="text-violet-400"
      />
      {/* Citation Rate: % of tracked prompts where the brand's own
          domain (caldwellrg.com etc) appeared in AI-cited sources.
          Directly actionable — answers "is AI actually surfacing my
          site?" which is the buying question for AI-SEO. */}
      <KpiTile
        label="Citation Rate"
        value={
          mainBrand?.domainCoverage != null
            ? `${Math.round(mainBrand.domainCoverage)}%`
            : stats.summary.domainCoverage != null
              ? `${Math.round(stats.summary.domainCoverage)}%`
              : "—"
        }
        Icon={Link2}
        accent="text-emerald-400"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// You vs Competitors panel — configured competitors with full metrics
// ---------------------------------------------------------------------------

function CompetitorsPanel({
  competitors,
}: {
  competitors: OtterlyCompetitorBrandMention[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-emerald-400" />
          You vs. configured competitors
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Side-by-side metrics for the brands you&apos;re tracking in Otterly.
        </p>
      </div>
      {competitors.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No competitor data yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-2 font-medium">Brand</th>
                <th className="text-right px-3 py-2 font-medium">Mentions</th>
                <th className="text-right px-3 py-2 font-medium">SoV</th>
                <th className="text-right px-3 py-2 font-medium">Rank</th>
                <th className="text-right px-3 py-2 font-medium">Visibility</th>
                <th className="text-right px-5 py-2 font-medium">NSS</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr
                  key={c.brand}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    c.isMainBrand && "bg-primary/5",
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.brand}</span>
                      {c.isMainBrand && (
                        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums">
                    {c.mentions}
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums">
                    {c.shareOfVoice}%
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums">
                    {c.averageRank != null ? `#${c.averageRank}` : "—"}
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums">
                    {c.visibilityScore}
                  </td>
                  <td
                    className={cn(
                      "text-right px-5 py-3 tabular-nums",
                      c.sentiment && c.sentiment.nss >= 0
                        ? "text-emerald-400"
                        : c.sentiment
                          ? "text-rose-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {c.sentiment
                      ? c.sentiment.nss > 0
                        ? `+${c.sentiment.nss}`
                        : c.sentiment.nss
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detected brand landscape — every brand AI engines mention near you
// ---------------------------------------------------------------------------

function DetectedBrandsPanel({ brands }: { brands: OtterlyDetectedBrand[] }) {
  const [expanded, setExpanded] = useState(false);
  // Collapse to top 20 by default — the rest are usually long-tail
  // noise. "Show all" button reveals everything when the user wants it.
  const visible = expanded ? brands : brands.slice(0, 20);
  const hidden = brands.length - visible.length;
  const max = brands[0]?.mentions ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Detected brand landscape
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Brands AI engines mention in responses about your space. Includes
          your configured competitors plus everyone else.
        </p>
      </div>
      {visible.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No brands detected yet.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map((b) => (
              <li key={b.name} className="px-5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {b.mentions} mention{b.mentions === 1 ? "" : "s"}
                  </span>
                </div>
                {/* Bar */}
                <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60"
                    style={{ width: `${(b.mentions / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full px-5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t border-border"
            >
              {expanded
                ? `Show top 20 only`
                : `Show all ${brands.length} brands (+${hidden} more)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top cited sources — domains AI engines cite about your space
// ---------------------------------------------------------------------------

function TopCitedSourcesPanel({
  domains,
}: {
  domains: Array<{ domain: string; isMainBrand: boolean; coverage: number }>;
}) {
  const top = domains.slice(0, 12);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-sky-400" />
          Top cited sources
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Domains AI engines pull info from. High-signal for PR / content
          placement.
        </p>
      </div>
      {top.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No citations yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((d) => (
            <li
              key={d.domain}
              className="px-5 py-2.5 flex items-center justify-between gap-3"
            >
              <a
                href={`https://${d.domain}`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "text-sm truncate hover:text-foreground",
                  d.isMainBrand ? "text-primary font-medium" : "text-foreground/90",
                )}
              >
                {d.domain}
                {d.isMainBrand && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-primary font-semibold">
                    Yours
                  </span>
                )}
              </a>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {d.coverage}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gate state — shown when the dashboard can't render
// ---------------------------------------------------------------------------

function GateState({
  title,
  body,
  ctaLabel,
  ctaHref,
  ctaExternal,
}: {
  title: string;
  body: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
  ctaExternal?: boolean;
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
          <a
            href={ctaHref}
            target={ctaExternal ? "_blank" : undefined}
            rel={ctaExternal ? "noreferrer" : undefined}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90"
          >
            {ctaLabel}
            {ctaExternal && <ExternalLink className="h-3.5 w-3.5" />}
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// First-run setup
//
// Shown when the user has an active profile + website_url, but no
// matching brand report exists and no in-flight setup request. POST
// to /api/apps/radar/setup inserts a request row, runs auto-research
// for ops, emails ops. After the POST returns we render the
// PendingSetup state directly (no reload needed — the dashboard API
// will also start returning pending_setup on next load).
// ---------------------------------------------------------------------------

// Linear UX phases shown to the customer. Driven by real backend
// signals from the radar-setup-research Trigger.dev task (polled via
// /api/apps/radar/setup/[id]/status). The backend has 6 phases:
//
//   created | started | researching | merging | ready_for_ops | failed
//
// Mapped to 5 UX phases:
//   0. created          → "Submitting your request"
//   1. started          → "Analyzing your profile"
//   2. researching      → "Scanning AI search engines"  (parallel
//                          server work; we time-split this UX phase
//                          with phase 3 below for nicer feel)
//   3. researching+15s  → "Researching local competitors"
//   4. merging          → "Adding to setup queue"
//
// `researching` is the slow bucket on the backend (parallel Otterly +
// LLM, can run 30-90s). The UX splits it into two sub-phases that
// auto-advance after 15s so the customer sees forward motion even
// while the server keeps grinding.
const SETUP_UX_PHASES = [
  "Submitting your request",
  "Analyzing your profile",
  "Scanning AI search engines",
  "Researching local competitors",
  "Adding to setup queue",
] as const;

function backendPhaseToUxIdx(
  phase: string | null,
  researchingMsElapsed: number,
): number {
  switch (phase) {
    case "created":
    case null:
      return 0;
    case "started":
      return 1;
    case "researching":
      return researchingMsElapsed > 15_000 ? 3 : 2;
    case "merging":
      return 4;
    case "ready_for_ops":
    case "failed":
      return SETUP_UX_PHASES.length; // beyond last — flag as done
    default:
      return 0;
  }
}

function FirstRunSetup({ hostname }: { hostname: string | null }) {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [backendPhase, setBackendPhase] = useState<string | null>(null);
  const [researchingSince, setResearchingSince] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // forces re-render for the time-based UX phase split
  const [pending, setPending] = useState<{
    id: string;
    hostname: string;
    status: "pending" | "researching" | "ready_for_ops";
    requested_at: string;
  } | null>(null);

  // Tick every 1s while researching to flip from "Scanning AI" to
  // "Researching competitors" once we cross 15s.
  useEffect(() => {
    if (backendPhase !== "researching") return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [backendPhase]);

  // Track when we entered the researching phase so the time-based UX
  // split has a stable origin (not affected by re-renders).
  useEffect(() => {
    if (backendPhase === "researching" && researchingSince === null) {
      setResearchingSince(Date.now());
    }
    if (backendPhase !== "researching") {
      setResearchingSince(null);
    }
  }, [backendPhase, researchingSince]);

  const handleStart = async () => {
    if (!hostname) return;
    setSubmitting(true);
    setBackendPhase(null);
    try {
      const res = await fetch("/api/apps/radar/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || (payload?.status !== "created" && payload?.status !== "existing")) {
        throw new Error(payload?.message ?? `Request failed (${res.status})`);
      }
      const requestId: string = payload.request_id;

      // If the request already existed, skip the polling loop and go
      // straight to the long-running PendingSetup view.
      if (payload.status === "existing") {
        setPending({
          id: requestId,
          hostname,
          status: payload.request_status,
          requested_at: payload.requested_at ?? new Date().toISOString(),
        });
        addToast({
          title: "Setup already in progress",
          description: `We'll have ${hostname} live in your dashboard within 24-48 hours.`,
        });
        return;
      }

      setBackendPhase(payload.phase ?? "created");

      // Poll status. Stop once we hit ready_for_ops or failed.
      const requestedAt = payload.requested_at ?? new Date().toISOString();
      const startedAt = Date.now();
      const MAX_POLL_MS = 4 * 60 * 1000; // 4 min hard ceiling
      while (Date.now() - startedAt < MAX_POLL_MS) {
        await new Promise((r) => setTimeout(r, 1_500));
        const statusRes = await fetch(
          `/api/apps/radar/setup/${requestId}/status`,
          { cache: "no-store" },
        );
        if (!statusRes.ok) continue;
        const s = await statusRes.json();
        setBackendPhase(s.phase ?? null);
        if (s.phase === "ready_for_ops" || s.phase === "failed") {
          setPending({
            id: requestId,
            hostname,
            status: s.status,
            requested_at: requestedAt,
          });
          addToast({
            title:
              s.phase === "failed"
                ? "Setup recorded (research issue)"
                : "Setup requested",
            description: `We'll have ${hostname} live in your dashboard within 24-48 hours.`,
          });
          return;
        }
      }
      // Hit the timeout — research is taking longer than expected.
      // Transition to PendingSetup anyway; the task is still running
      // server-side and the dashboard will catch up on next load.
      setPending({
        id: requestId,
        hostname,
        status: "researching",
        requested_at: requestedAt,
      });
    } catch (e) {
      addToast({
        title: "Couldn't submit setup request",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  if (pending) {
    return <PendingSetup pending={pending} />;
  }

  if (submitting) {
    const uxIdx = backendPhaseToUxIdx(
      backendPhase,
      researchingSince ? Date.now() - researchingSince : 0,
    );
    // tick keeps the parent re-rendering while we're researching so
    // the UX phase split flips at the 15s mark. Reading it here keeps
    // the effect/closure relationship visible.
    void tick;
    return <SetupInProgress hostname={hostname} uxIdx={uxIdx} />;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Let&apos;s set up Radar</h2>
          <div className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            We&apos;ll start tracking how{" "}
            <span className="font-medium text-foreground">
              {hostname ?? "your site"}
            </span>{" "}
            shows up across ChatGPT, Perplexity, Gemini, and the rest of the
            AI search landscape. Setup takes 24-48 hours; we&apos;ll email
            you when your dashboard is live.
          </div>
          <button
            type="button"
            onClick={handleStart}
            disabled={!hostname}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request setup
          </button>
          <p className="mt-4 text-[11px] text-muted-foreground/70">
            Tracks the brand on your active profile. Switch profiles to set
            up a different one.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// In-progress panel — phased checklist + progress bar. uxIdx is driven
// by real backend phase polled from the server (not a client timer),
// so the bar accurately reflects what the task is doing.
// ---------------------------------------------------------------------------
function SetupInProgress({
  hostname,
  uxIdx,
}: {
  hostname: string | null;
  uxIdx: number;
}) {
  // Progress bar: ratio of phases completed, parked at 95% until the
  // backend reports ready_for_ops (at which point the parent
  // transitions to PendingSetup and this panel unmounts).
  const ratio = Math.min(uxIdx, SETUP_UX_PHASES.length - 1) / (SETUP_UX_PHASES.length - 1);
  const percent = Math.min(95, Math.round(ratio * 100));

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Setting up Radar</h2>
              <p className="text-xs text-muted-foreground">
                {hostname ?? "your site"} · 15-30 seconds
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6 mb-6">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums text-right">
              {percent}%
            </div>
          </div>

          {/* Phase list */}
          <ol className="space-y-2.5">
            {SETUP_UX_PHASES.map((label, idx) => {
              const isDone = idx < uxIdx;
              const isCurrent = idx === uxIdx;
              return (
                <li
                  key={label}
                  className="flex items-center gap-3 text-sm"
                >
                  <span
                    className={cn(
                      "flex items-center justify-center h-5 w-5 rounded-full shrink-0 transition-colors",
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <CheckIcon />
                    ) : isCurrent ? (
                      <DotIcon />
                    ) : (
                      <span className="text-[10px] tabular-nums">{idx + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "transition-colors",
                      isDone
                        ? "text-muted-foreground line-through"
                        : isCurrent
                          ? "text-foreground font-medium"
                          : "text-muted-foreground",
                    )}
                  >
                    {label}
                    {isCurrent && (
                      <span className="ml-1 inline-flex">
                        <span className="animate-pulse">·</span>
                        <span className="animate-pulse [animation-delay:150ms]">·</span>
                        <span className="animate-pulse [animation-delay:300ms]">·</span>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-6 text-[11px] text-muted-foreground/70 text-center">
            You can close this tab — we&apos;ll email you when your dashboard
            is ready.
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6.5 L5 9.5 L10 3" />
    </svg>
  );
}

function DotIcon() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />;
}

// ---------------------------------------------------------------------------
// Pending setup — shown when a request is in flight (any non-terminal
// status). The customer doesn't need to know the difference between
// "researching" and "ready_for_ops" — both mean "we're on it, check
// back later" from their perspective.
// ---------------------------------------------------------------------------
function PendingSetup({
  pending,
}: {
  pending: {
    id: string;
    hostname: string;
    status: "pending" | "researching" | "ready_for_ops";
    requested_at: string;
  } | null;
}) {
  if (!pending) {
    return <RadarOtterlyDashboardSkeleton />;
  }
  const requested = new Date(pending.requested_at);
  const requestedLabel = requested.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">
            We&apos;re setting up your tracking
          </h2>
          <div className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            We&apos;re configuring AI visibility tracking for{" "}
            <span className="font-medium text-foreground">
              {pending.hostname}
            </span>
            . First results typically land in 24-48 hours — we&apos;ll email
            you the moment your dashboard is ready.
          </div>
          <div className="mt-6 text-[11px] text-muted-foreground/70 space-y-0.5">
            <div>Requested {requestedLabel}</div>
            <div>
              Reference: <code>{pending.id}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unused but kept ready for the eventual "trend up/down" indicators
// on the time-series widgets.
export const TrendUp = ArrowUp;
export const TrendDown = ArrowDown;
