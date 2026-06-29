"use client";

import Link from "next/link";
import {
  Plus,
  ArrowRight,
  Mail,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Sparkles,
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
  HeroRun,
  CampaignStory,
  HotContact,
  NeighborhoodRow,
  ThisWeekSummary,
  HealthRail as HealthRailType,
} from "@/lib/hyperlocal/dashboard-data";

const PHASE_BLURB: Record<string, string> = {
  review: "Drafts ready for your eyes",
  awaiting_service_area: "Pick your service area to continue",
  awaiting_mls: "Waiting for your MLS upload",
  sending: "Sending now",
  generate: "Drafting emails",
  discover: "Pulling contacts from your CRM",
  completed: "Your most recent send",
};

export function HyperlocalDashboardClient({ data }: { data: DashboardData }) {
  const { hero, this_week, recent_campaigns, hot_contacts, neighborhoods, health } = data;

  return (
    <PageFrame>
      <PageHeader
        title="Hyperlocal"
        description="What's happening across your sphere this week."
        actions={
          <Link href="/apps/hyperlocal/campaigns">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        }
      />

      <HealthRailRow health={health} />

      <HeroAttentionCard hero={hero} />

      <ThisWeekSentenceCard summary={this_week} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HotContactsCard contacts={hot_contacts} />
        <NeighborhoodLeaderboardCard rows={neighborhoods} />
      </div>

      <RecentCampaignStoriesCard stories={recent_campaigns} />
    </PageFrame>
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

// ---------------------------------------------------------------------------
// Hero — adaptive by variant (review | in_flight | recap | empty)
// ---------------------------------------------------------------------------

function HeroAttentionCard({ hero }: { hero: HeroRun | null }) {
  if (!hero) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-gradient-to-br from-card to-card/60 p-10 text-center">
        <Sparkles className="h-7 w-7 mx-auto mb-3 text-primary/80" />
        <h2 className="text-lg font-semibold">Send your first neighborhood report</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Pull contacts from your CRM, drop in your MLS export, and we'll write a market story for each
          neighborhood you serve.
        </p>
        <Link href="/apps/hyperlocal/campaigns" className="inline-block mt-4">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create your first campaign
          </Button>
        </Link>
      </div>
    );
  }

  const variant = hero.variant;
  const eyebrow = (() => {
    if (variant === "review") return "Awaiting your review";
    if (variant === "in_flight") return PHASE_BLURB[hero.phase] ?? "In progress";
    if (variant === "recap") return "Latest send";
    return "";
  })();

  const eyebrowColor =
    variant === "review"
      ? "text-primary"
      : variant === "in_flight"
        ? "text-amber-400"
        : "text-emerald-400";

  const headline =
    hero.geo_headline
      ? `${hero.geo_headline} market report`
      : hero.campaign_name ?? "Untitled run";

  const subline = hero.subject_preview ?? hero.campaign_name ?? "";

  const cta = (() => {
    if (variant === "review") {
      return (
        <Link href={`/apps/hyperlocal/runs/${hero.run_id}`}>
          <Button size="lg" className="gap-2">
            Review &amp; send
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      );
    }
    if (variant === "in_flight") {
      return (
        <Link href={`/apps/hyperlocal/runs/${hero.run_id}`}>
          <Button size="lg" variant="secondary" className="gap-2">
            View progress
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      );
    }
    return (
      <Link href={`/apps/hyperlocal/runs/${hero.run_id}`}>
        <Button size="lg" variant="secondary" className="gap-2">
          See full results
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  })();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-6 sm:p-8",
        variant === "review" && "border-primary/30 from-primary/10 via-card to-card",
        variant === "in_flight" && "border-amber-500/20 from-amber-500/5 via-card to-card",
        variant === "recap" && "border-border from-card to-card/80",
      )}
    >
      {variant === "in_flight" && (
        <Loader2 className="absolute right-6 top-6 h-4 w-4 text-amber-400 animate-spin" />
      )}

      <p className={cn("text-xs font-semibold uppercase tracking-wider", eyebrowColor)}>
        {eyebrow}
      </p>

      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">{headline}</h2>

      {subline && headline !== subline && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{subline}</p>
      )}

      {hero.preheader_preview && (
        <p className="text-xs text-muted-foreground/80 mt-1 italic max-w-2xl truncate">
          “{hero.preheader_preview}”
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-sm">
        {hero.segments_count > 0 && (
          <Stat label="segments" value={hero.segments_count} />
        )}
        <Stat label="recipients" value={hero.recipients_count.toLocaleString()} />
        {hero.lens && <Stat label="lens" value={hero.lens} />}
        {hero.email_address && <Stat label="from" value={hero.email_address} mono />}
      </div>

      {variant === "recap" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-muted-foreground border-t border-border/60 pt-4">
          <span><b className="text-foreground">{hero.opens ?? 0}</b> opened</span>
          <span>·</span>
          <span><b className="text-foreground">{hero.clicks ?? 0}</b> clicks</span>
          <span>·</span>
          <span><b className="text-foreground">{hero.bounces ?? 0}</b> bounced</span>
          <span>·</span>
          <span><b className="text-foreground">{hero.unsubscribes ?? 0}</b> unsubscribed</span>
        </div>
      )}

      <div className="mt-6">{cta}</div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("font-semibold text-foreground", mono && "font-mono text-[13px]")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// This week — narrative summary with sparkline.
// ---------------------------------------------------------------------------

function ThisWeekSentenceCard({ summary }: { summary: ThisWeekSummary }) {
  const hasData = summary.sends > 0;
  const TrendIcon =
    summary.vs_prior_week_open_rate_delta > 0.01
      ? TrendingUp
      : summary.vs_prior_week_open_rate_delta < -0.01
        ? TrendingDown
        : Minus;
  const trendColor =
    summary.vs_prior_week_open_rate_delta > 0.01
      ? "text-emerald-400"
      : summary.vs_prior_week_open_rate_delta < -0.01
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            This week
          </p>
          {hasData ? (
            <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
              Your sends reached{" "}
              <b className="text-foreground">{summary.sends.toLocaleString()}</b> contacts.{" "}
              <b className="text-foreground">{pct(summary.open_rate)}</b> opened,{" "}
              <b className="text-foreground">{pct(summary.click_rate)}</b> clicked.
              {summary.opens > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  That's <b className="text-foreground">{summary.opens.toLocaleString()}</b> people
                  who saw your name in their inbox.
                </span>
              )}
            </p>
          ) : (
            <p className="text-base text-muted-foreground">
              No sends in the last 7 days — once you send a campaign, your weekly recap shows up here.
            </p>
          )}
        </div>

        {hasData && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Sparkline values={summary.spark_daily_sends} />
            <span className={cn("text-xs flex items-center gap-1", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {summary.vs_prior_week_open_rate_delta === 0
                ? "vs last week"
                : `${summary.vs_prior_week_open_rate_delta > 0 ? "+" : ""}${pct(summary.vs_prior_week_open_rate_delta)} open rate vs last week`}
            </span>
          </div>
        )}
      </div>
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

