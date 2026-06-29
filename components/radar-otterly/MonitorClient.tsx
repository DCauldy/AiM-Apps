"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  OtterlyBrandHistoryPoint,
  OtterlyBrandReport,
  OtterlyBrandReportStats,
  OtterlyDomainHistoryPoint,
} from "@/lib/radar-otterly/types";

// ============================================================
// Monitor tab — trends over time.
//
// Reuses the dashboard API (/api/apps/radar/dashboard) — same
// stats payload, different rendering layer. Charts:
//
//   1. Coverage trend       (main brand vs top 3 competitors)
//   2. Rank trend           (inverted Y — lower rank = better)
//   3. Visibility index     (Otterly's composite per-brand score)
//   4. Citation source mix  (top 8 domains over time)
//
// Sparse for the first ~14 days — Otterly emits one data point per
// engine per prompt per day. Show "needs more data" hint when
// fewer than 3 days of history exist.
// ============================================================

type DashboardStatus =
  | "ready"
  | "no_active_profile"
  | "no_website_url"
  | "pending_setup"
  | "no_matching_report"
  | "otterly_error";

interface DashboardResponse {
  status: DashboardStatus;
  report?: OtterlyBrandReport;
  stats?: OtterlyBrandReportStats;
  error?: { message: string; status: number };
}

const COMPETITOR_COLORS = [
  "hsl(199, 89%, 60%)",
  "hsl(280, 80%, 65%)",
  "hsl(0, 80%, 65%)",
];
const MAIN_BRAND_COLOR = "hsl(38, 92%, 55%)";

export function RadarMonitorClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/dashboard", { cache: "no-store" });
      const payload = (await res.json()) as DashboardResponse;
      if (!res.ok) throw new Error("Failed to load Monitor");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Monitor",
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

  if (loading && !data) return <MonitorSkeleton />;
  if (!data) return <MonitorSkeleton />;

  if (data.status !== "ready") {
    return (
      <GateState
        title={statusTitle(data.status)}
        body={
          data.status === "otterly_error"
            ? `Couldn't load trends right now. ${data.error?.message ?? ""}`
            : "Trends will populate here once tracking is set up and data starts arriving."
        }
      />
    );
  }

  const stats = data.stats!;
  const report = data.report!;

  // Pick the main brand row (the agent's brand) so we can highlight
  // its line vs. competitors.
  const mainBrandName = report.brand;
  const competitorBrands = (
    stats.competitorBrandsAnalysis.brandMentions ?? []
  )
    .filter((b) => !b.isMainBrand)
    .slice(0, 3)
    .map((b) => b.brand);

  const coverageData = buildBrandSeries(
    stats.competitorBrandsAnalysis.brandCoverageHistory,
    mainBrandName,
    competitorBrands,
    (b) => b.brandCoverage ?? b.coverage ?? null,
  );
  const rankData = buildBrandSeries(
    stats.allBrandsAnalysis.brandRankHistory,
    mainBrandName,
    competitorBrands,
    (b) => b.rank ?? null,
  );
  const visibilityData = buildBrandSeries(
    stats.competitorBrandsAnalysis.brandVisibilityIndex,
    mainBrandName,
    competitorBrands,
    (b) => b.visibilityScore ?? null,
  );
  const sourceMixData = buildDomainSeries(
    stats.allBrandsAnalysis.domainCoverageHistory,
    8,
  );

  const daysOfData = coverageData.length;
  const sparse = daysOfData < 3;

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Monitor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              How {report.brand} trends across AI engines over the last 30 days.
            </p>
          </div>
          {sparse && (
            <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-md">
              {daysOfData} day{daysOfData === 1 ? "" : "s"} of data — charts
              get more useful as history accumulates.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Brand coverage"
            subtitle="% of prompts where each brand was mentioned, per day."
            unit="%"
          >
            <BrandLineChart
              data={coverageData}
              mainBrand={mainBrandName}
              competitorBrands={competitorBrands}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
          </ChartCard>

          <ChartCard
            title="Average rank"
            subtitle="Position when mentioned — lower is better."
            unit="#"
          >
            <BrandLineChart
              data={rankData}
              mainBrand={mainBrandName}
              competitorBrands={competitorBrands}
              reverseY
              tickFormatter={(v) => `#${v}`}
            />
          </ChartCard>

          <ChartCard
            title="Visibility index"
            subtitle="Otterly's composite score combining mentions + coverage + position."
            unit=""
          >
            <BrandLineChart
              data={visibilityData}
              mainBrand={mainBrandName}
              competitorBrands={competitorBrands}
            />
          </ChartCard>

          <ChartCard
            title="Top cited sources"
            subtitle="Most-cited domains across all prompts, per day."
            unit="%"
          >
            <DomainLineChart data={sourceMixData} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time-series builders
//
// Otterly returns each metric as Array<{ date, brands: [{...}] }>
// (or domains: [...]). For charts we need the inverted layout:
// Array<{ date, [brand1]: value, [brand2]: value, ... }> so recharts
// can plot multiple Lines on one X axis.
// ---------------------------------------------------------------------------

interface ChartPoint {
  date: string;
  [brand: string]: number | string | null;
}

function buildBrandSeries(
  history: OtterlyBrandHistoryPoint[] | undefined,
  mainBrand: string,
  competitorBrands: string[],
  selector: (row: OtterlyBrandHistoryPoint["brands"][number]) => number | null | undefined,
): ChartPoint[] {
  const days = history ?? [];
  const brandsToPlot = [mainBrand, ...competitorBrands];

  return days
    .map((day) => {
      const point: ChartPoint = { date: day.date };
      for (const b of brandsToPlot) {
        const row = day.brands.find(
          (r) => r.brand.toLowerCase() === b.toLowerCase(),
        );
        const value = row ? selector(row) : null;
        point[b] = value ?? null;
      }
      return point;
    })
    .sort((a, b) => a.date.localeCompare(b.date as string));
}

interface DomainChartPoint {
  date: string;
  [domain: string]: number | string;
}

function buildDomainSeries(
  history: OtterlyDomainHistoryPoint[] | undefined,
  topN: number,
): { rows: DomainChartPoint[]; domains: string[] } {
  const days = history ?? [];
  if (days.length === 0) return { rows: [], domains: [] };

  // Aggregate total coverage per domain so we can pick the top N
  // across the entire window (rather than per-day) — keeps the
  // chart focused on consistently-cited sources.
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const d of day.domains) {
      totals.set(d.domain, (totals.get(d.domain) ?? 0) + (d.coverage ?? 0));
    }
  }
  const topDomains = Array.from(totals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([d]) => d);

  const rows: DomainChartPoint[] = days
    .map((day) => {
      const point: DomainChartPoint = { date: day.date };
      for (const dom of topDomains) {
        const found = day.domains.find((d) => d.domain === dom);
        point[dom] = found?.coverage ?? 0;
      }
      return point;
    })
    .sort((a, b) => a.date.localeCompare(b.date as string));

  return { rows, domains: topDomains };
}

// ---------------------------------------------------------------------------
// Chart primitives
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  subtitle,
  unit: _unit,
  children,
}: {
  title: string;
  subtitle: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="h-64 p-3">{children}</div>
    </div>
  );
}

function BrandLineChart({
  data,
  mainBrand,
  competitorBrands,
  reverseY,
  tickFormatter,
  domain,
}: {
  data: ChartPoint[];
  mainBrand: string;
  competitorBrands: string[];
  reverseY?: boolean;
  tickFormatter?: (v: number) => string;
  domain?: [number, number];
}) {
  if (data.length === 0) {
    return <ChartEmptyState />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          stroke="hsl(var(--muted-foreground))"
          fontSize={10}
          tickFormatter={formatDateShort}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={10}
          reversed={reverseY}
          domain={domain ?? ["auto", "auto"]}
          tickFormatter={tickFormatter}
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelFormatter={(v) => formatDateLong(v as string)}
          formatter={(value, name) =>
            value == null
              ? ["—", name as string]
              : [
                  tickFormatter ? tickFormatter(Number(value)) : (value as number | string),
                  name as string,
                ]
          }
        />
        <Line
          type="monotone"
          dataKey={mainBrand}
          stroke={MAIN_BRAND_COLOR}
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        {competitorBrands.map((b, i) => (
          <Line
            key={b}
            type="monotone"
            dataKey={b}
            stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function DomainLineChart({
  data,
}: {
  data: { rows: DomainChartPoint[]; domains: string[] };
}) {
  const colors = useMemo(
    () => [
      "hsl(38, 92%, 55%)",
      "hsl(199, 89%, 60%)",
      "hsl(280, 80%, 65%)",
      "hsl(0, 80%, 65%)",
      "hsl(160, 70%, 50%)",
      "hsl(50, 85%, 55%)",
      "hsl(230, 70%, 65%)",
      "hsl(330, 70%, 60%)",
    ],
    [],
  );
  if (data.rows.length === 0) {
    return <ChartEmptyState />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data.rows}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          stroke="hsl(var(--muted-foreground))"
          fontSize={10}
          tickFormatter={formatDateShort}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={10}
          tickFormatter={(v) => `${v}%`}
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelFormatter={(v) => formatDateLong(v as string)}
          formatter={(value, name) => [`${value}%`, name as string]}
        />
        {data.domains.map((d, i) => (
          <Line
            key={d}
            type="monotone"
            dataKey={d}
            stroke={colors[i % colors.length]}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-xs text-muted-foreground">
      <div>No data yet for this window.</div>
      <div className="text-[10px]">
        Charts fill in as Otterly runs your prompts across engines daily.
      </div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Skeleton + gate + status helper
// ---------------------------------------------------------------------------

function statusTitle(status: DashboardStatus): string {
  switch (status) {
    case "no_active_profile":
      return "Set up a profile first";
    case "no_website_url":
      return "Add your website URL";
    case "pending_setup":
      return "Setup is in progress";
    case "no_matching_report":
      return "Tracking isn't set up yet";
    case "otterly_error":
      return "Monitor is temporarily unavailable";
    default:
      return "";
  }
}

function MonitorSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-card border border-border rounded-lg animate-pulse"
            />
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
          <div
            className={cn(
              "mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary",
            )}
          >
            {body && typeof body === "string" && body.startsWith("Couldn't") ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <ExternalLink className="h-6 w-6" />
            )}
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
