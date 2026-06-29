"use client";

import Link from "next/link";
import {
  Plus,
  ArrowRight,
  Mail,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Flame,
} from "lucide-react";
import {
  PageFrame,
  PageHeader,
  EmptyState,
} from "@/components/app-shell/PagePrimitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DashboardData,
  CampaignStory,
  HotContact,
  NeighborhoodRow,
  ThisWeekSummary,
  HealthRail as HealthRailType,
} from "@/lib/hyperlocal/dashboard-data";


export function HyperlocalDashboardClient({ data }: { data: DashboardData }) {
  const { this_week, recent_campaigns, hot_contacts, neighborhoods, health } = data;

  return (
    <PageFrame>
      <PageHeader
        title="Performance"
        description="How your hyperlocal campaigns are landing."
        actions={
          <Link href="/apps/hyperlocal/map">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New campaign
            </Button>
          </Link>
        }
      />

      {/* Weekly KPIs — the headline numbers */}
      <WeeklyKpis summary={this_week} />

      <HealthRailRow health={health} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeighborhoodLeaderboardCard rows={neighborhoods} />
        <HotContactsCard contacts={hot_contacts} />
      </div>

      <RecentCampaignStoriesCard stories={recent_campaigns} />
    </PageFrame>
  );
}

// ---------------------------------------------------------------------------
// Weekly KPIs — scannable stat tiles + sparkline (replaces the hero +
// narrative sentence; this is a stats page, not an action surface).
// ---------------------------------------------------------------------------

function WeeklyKpis({ summary }: { summary: ThisWeekSummary }) {
  const hasData = summary.sends > 0;
  const delta = summary.vs_prior_week_open_rate_delta;
  const TrendIcon = delta > 0.01 ? TrendingUp : delta < -0.01 ? TrendingDown : Minus;
  const trendColor =
    delta > 0.01
      ? "text-emerald-400"
      : delta < -0.01
        ? "text-rose-400"
        : "text-muted-foreground";

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No sends in the last 7 days — launch a campaign and your weekly
          performance shows up here.
        </p>
      </div>
    );
  }

  const tiles: { label: string; value: string; sub?: React.ReactNode }[] = [
    { label: "Sent", value: summary.sends.toLocaleString() },
    {
      label: "Open rate",
      value: pct(summary.open_rate),
      sub: (
        <span className={cn("flex items-center gap-1 text-xs", trendColor)}>
          <TrendIcon className="h-3 w-3" />
          {delta === 0
            ? "vs last week"
            : `${delta > 0 ? "+" : ""}${pct(delta)} vs last week`}
        </span>
      ),
    },
    { label: "Click rate", value: pct(summary.click_rate) },
    { label: "Opened", value: summary.opens.toLocaleString(), sub: "people saw your name" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          This week
        </p>
        <Sparkline values={summary.spark_daily_sends} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label}>
            <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.label}</p>
            {t.sub && <div className="mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health rail — slim status row that replaces the four giant counter cards.
// ---------------------------------------------------------------------------

function HealthRailRow({ health }: { health: HealthRailType }) {
  const dotClass =
    health.severity === "good"
      ? "bg-emerald-500"
      : health.severity === "warn"
        ? "bg-amber-500"
        : "bg-rose-500";

  const headline =
    health.severity === "good"
      ? "All systems good"
      : health.severity === "warn"
        ? "Worth a look"
        : "Needs attention";

  const parts: string[] = [];
  parts.push(`bounce ${pct(health.bounce_rate)}`);
  parts.push(health.domain_verified ? "domain verified" : "domain unverified");
  if (health.paused_connections > 0) parts.push(`${health.paused_connections} sender paused`);
  parts.push(`${health.suppressions_this_week} new suppression${health.suppressions_this_week === 1 ? "" : "s"} this week`);

  return (
    <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-2 text-foreground font-medium">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        {headline}
      </span>
      <span className="hidden sm:inline opacity-40">·</span>
      <span>{parts.join(" · ")}</span>
      <span className="ml-auto flex items-center gap-3">
        {health.crm_label && (
          <span className="flex items-center gap-1.5">
            <span className="opacity-60">CRM:</span>
            <span className="text-foreground/80">{health.crm_label}</span>
          </span>
        )}
        {health.email_label && (
          <span className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 opacity-60" />
            <span className="text-foreground/80 truncate max-w-[14rem]">{health.email_label}</span>
          </span>
        )}
        <Link
          href="/apps/hyperlocal/settings"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings
        </Link>
      </span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1 h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-primary/60"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hot contacts — people leaning in.
// ---------------------------------------------------------------------------

function HotContactsCard({ contacts }: { contacts: HotContact[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">People leaning in</h2>
        </div>
        <span className="text-xs text-muted-foreground">last 30 days</span>
      </div>

      {contacts.length === 0 ? (
        <EmptyState text="Once your contacts start engaging, your warmest leads will show up here." />
      ) : (
        <ul className="space-y-1 flex-1">
          {contacts.map((c) => (
            <li
              key={c.email}
              className="flex items-center justify-between rounded-md px-2.5 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name ?? c.email}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.signature}
                  {c.name && (
                    <>
                      <span className="opacity-50"> · </span>
                      <span className="font-mono text-[11px]">{c.email}</span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 ml-3">
                {relativeTime(c.last_event_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neighborhood leaderboard.
// ---------------------------------------------------------------------------

function NeighborhoodLeaderboardCard({ rows }: { rows: NeighborhoodRow[] }) {
  const maxRate = Math.max(0.0001, ...rows.map((r) => r.open_rate));
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Top neighborhoods</h2>
        </div>
        <span className="text-xs text-muted-foreground">by open rate</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Send to a few neighborhoods and your top performers rank here." />
      ) : (
        <ul className="space-y-2.5 flex-1">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between mb-1 text-sm">
                <span className="font-medium truncate">{r.label}</span>
                <span className="text-foreground/80 tabular-nums">{pct(r.open_rate)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full"
                  style={{ width: `${(r.open_rate / maxRate) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {r.recipients.toLocaleString()} recipients · {r.clicks} click{r.clicks === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent campaign stories — replaces "Recent runs" log.
// ---------------------------------------------------------------------------

function RecentCampaignStoriesCard({ stories }: { stories: CampaignStory[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">Recent campaigns</h2>
        <Link
          href="/apps/hyperlocal/campaigns"
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          View all
        </Link>
      </div>

      {stories.length === 0 ? (
        <EmptyState
          text="No completed campaigns yet."
          actionText="Create your first campaign"
          actionHref="/apps/hyperlocal/campaigns"
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {stories.map((s) => (
            <li key={s.run_id}>
              <Link
                href={`/apps/hyperlocal/runs/${s.run_id}`}
                className="flex items-center gap-4 py-3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.geo_headline ? `${s.geo_headline} — ` : ""}
                    {s.campaign_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.sent_label} to{" "}
                    <span className="text-foreground/80">{s.recipients_count.toLocaleString()}</span> contacts
                    <span className="opacity-50"> · </span>
                    <span className="text-foreground/80">{pct(s.open_rate)}</span> opened
                    <span className="opacity-50"> · </span>
                    <span className="text-foreground/80">{s.clicks}</span> click{s.clicks === 1 ? "" : "s"}
                    {s.unsubscribes > 0 && (
                      <>
                        <span className="opacity-50"> · </span>
                        <span className="text-rose-300/80">{s.unsubscribes} unsub</span>
                      </>
                    )}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function pct(n: number): string {
  if (!isFinite(n) || n === 0) return "0%";
  const v = n * 100;
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

