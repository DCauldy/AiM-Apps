"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  Globe,
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
  OtterlyRecommendation,
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
    | "no_matching_report"
    | "otterly_error";
  profile?: { id: string; website_url: string; hostname: string };
  account?: OtterlyAccountInfo;
  report?: OtterlyBrandReport;
  stats?: OtterlyBrandReportStats;
  recommendations?: OtterlyRecommendation[];
  hostname?: string;
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
          body="Radar matches your active profile to its Otterly brand report by website domain. Add a Website URL to this profile to continue."
          ctaLabel="Edit profile"
          ctaHref="/apps/profile"
        />
      );
    case "no_matching_report":
      return (
        <GateState
          title={`No brand intelligence for ${data.hostname ?? "this domain"} yet`}
          body={
            <>
              Add this domain as a brand in your{" "}
              <a
                href="https://app.otterly.ai"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Otterly dashboard
              </a>{" "}
              — once it's set up there, this view will populate
              automatically. The brand&apos;s <code className="text-foreground/80">brandDomain</code>{" "}
              must match <code className="text-foreground/80">{data.hostname}</code>.
            </>
          }
          ctaLabel="Open Otterly"
          ctaHref="https://app.otterly.ai"
          ctaExternal
        />
      );
    case "otterly_error":
      return (
        <GateState
          title="Otterly returned an error"
          body={
            <>
              <code className="text-foreground/80">
                {data.error?.status} — {data.error?.message ?? "Unknown error"}
              </code>
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
  const account = data.account!;
  const recommendations = data.recommendations ?? [];
  const mainBrand =
    stats.competitorBrandsAnalysis.brandMentions.find((b) => b.isMainBrand) ??
    null;

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Header report={report} stats={stats} account={account} />
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
            <RecommendationsPanel items={recommendations} />
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
  account,
}: {
  report: OtterlyBrandReport;
  stats: OtterlyBrandReportStats;
  account: OtterlyAccountInfo;
}) {
  const isTrial = account.subscriptionPlan === "trial";
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
      {isTrial && account.subscriptionEndDate && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Otterly trial ends{" "}
            {new Date(account.subscriptionEndDate).toLocaleDateString()}.{" "}
            <a
              href="https://otterly.ai/pricing"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-amber-100"
            >
              Upgrade to keep Radar running.
            </a>
          </span>
        </div>
      )}
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
      <KpiTile
        label="Visibility Score"
        value={mainBrand?.visibilityScore ?? "—"}
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
      <KpiTile
        label="Likelihood to Buy"
        value={
          mainBrand?.likelihoodToBuy != null
            ? `${mainBrand.likelihoodToBuy}%`
            : "—"
        }
        Icon={Trophy}
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
  // Cap to 20 — beyond that it's noise. Show the rest count.
  const top = brands.slice(0, 20);
  const remaining = brands.length - top.length;
  const max = top[0]?.mentions ?? 0;

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
      {top.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No brands detected yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((b) => (
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
          {remaining > 0 && (
            <li className="px-5 py-2.5 text-xs text-muted-foreground">
              + {remaining} more
            </li>
          )}
        </ul>
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
// Recommendations — Otterly's actionable cards
// ---------------------------------------------------------------------------

const RECOMMENDATION_COPY: Record<
  string,
  { title: string; body: (data: Record<string, unknown>) => string }
> = {
  competitors_count: {
    title: "Add more competitors",
    body: (d) => {
      const n = (d.totalCompetitors as number) ?? 0;
      return `Only ${n} competitor tracked — add 2-3 more for richer share-of-voice comparisons.`;
    },
  },
};

function RecommendationsPanel({ items }: { items: OtterlyRecommendation[] }) {
  const suggested = items.filter((r) => r.state === "suggested");
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          Recommendations
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Suggestions from Otterly to strengthen tracking + visibility.
        </p>
      </div>
      {suggested.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          All caught up — no open recommendations.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {suggested.map((r) => {
            const meta = RECOMMENDATION_COPY[r.type] ?? {
              title: r.type,
              body: () =>
                "Configure this in your Otterly dashboard. Details: " +
                JSON.stringify(r.data),
            };
            return (
              <li key={r.id} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium">{meta.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {meta.body(r.data)}
                    </p>
                  </div>
                  <a
                    href="https://app.otterly.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Open Otterly"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </li>
            );
          })}
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

// Unused but kept ready for the eventual "trend up/down" indicators
// on the time-series widgets.
export const TrendUp = ArrowUp;
export const TrendDown = ArrowDown;
