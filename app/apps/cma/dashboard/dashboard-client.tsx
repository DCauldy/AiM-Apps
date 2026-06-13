"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Send,
  CalendarClock,
  Sparkles,
  Loader2,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  MousePointerClick,
  MailOpen,
  Mail,
  ArrowRight,
  Settings as SettingsIcon,
  PlugZap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  CmaDashboardResponse,
  CmaEngagementRates,
  CmaRecentDelivery,
  CmaUpcomingDelivery,
} from "@/types/cma";

export function DashboardClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<CmaDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/listing-studio/dashboard", {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setData(payload as CmaDashboardResponse);
    } catch (e) {
      addToast({
        title: "Couldn't load dashboard",
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="container max-w-6xl mx-auto px-4 py-12">
          <p className="text-sm text-muted-foreground">Dashboard unavailable.</p>
        </div>
      </div>
    );
  }

  const hasAnyClient = data.active_clients > 0 || data.pending_review > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Header
          tier={data.tier}
          activeClients={data.active_clients}
          limit={data.active_clients_limit}
          defaultCadenceDays={data.default_cadence_days}
        />

        {!hasAnyClient ? (
          <OnboardingState />
        ) : (
          <>
            <StatsGrid data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
                <UpcomingPanel
                  upcoming={data.upcoming}
                  reminderLeadDays={data.reminder_lead_days}
                  dueWithinWindow={data.due_within_reminder_window}
                />
                <RecentPanel recent={data.recent} />
              </div>
              <div className="space-y-5">
                <EngagementCard
                  title="This month"
                  rates={data.rates_this_month}
                />
                <EngagementCard
                  title="Last 30 days"
                  rates={data.rates_last_30_days}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  tier,
  activeClients,
  limit,
  defaultCadenceDays,
}: {
  tier: string;
  activeClients: number;
  limit: number | "unlimited";
  defaultCadenceDays: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Past-client cadence at a glance. Default sends every{" "}
          {defaultCadenceDays} days · {tier} tier.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold text-foreground">
            {activeClients}
          </span>
          <span>/</span>
          <span>{limit === "unlimited" ? "∞" : limit}</span>
          <span>clients</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats grid
// ---------------------------------------------------------------------------

function StatsGrid({ data }: { data: CmaDashboardResponse }) {
  const remaining =
    data.active_clients_limit === "unlimited"
      ? null
      : Math.max(0, (data.active_clients_limit as number) - data.active_clients);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Enrolled"
        value={data.active_clients.toLocaleString()}
        sub={
          remaining === null
            ? "Unlimited capacity"
            : `${remaining.toLocaleString()} slots open`
        }
        Icon={Users}
        accent="text-emerald-400"
        href="/apps/cma/clients?filter=enrolled"
      />
      <StatCard
        label="Pending review"
        value={data.pending_review.toLocaleString()}
        sub="Synced from CRM, not yet enrolled"
        Icon={Sparkles}
        accent="text-[#D4A35C]"
        href="/apps/cma/clients?filter=pending"
      />
      <StatCard
        label={`Due in next ${data.reminder_lead_days}d`}
        value={data.due_within_reminder_window.toLocaleString()}
        sub="Cadence due within reminder window"
        Icon={CalendarClock}
        accent="text-sky-400"
        href="/apps/cma/clients?filter=enrolled"
      />
      <StatCard
        label="Sent this month"
        value={data.deliveries_this_month.toLocaleString()}
        sub={`${data.manual_sends_this_month} manual${data.manual_sends_limit === "unlimited" ? "" : ` / ${data.manual_sends_limit}`}`}
        Icon={Send}
        accent="text-violet-400"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  Icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-[#D4A35C]/40 hover:bg-card/80"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming panel
// ---------------------------------------------------------------------------

function UpcomingPanel({
  upcoming,
  reminderLeadDays,
  dueWithinWindow,
}: {
  upcoming: CmaUpcomingDelivery[];
  reminderLeadDays: number;
  dueWithinWindow: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#D4A35C]" />
            Upcoming sends
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {dueWithinWindow > 0
              ? `${dueWithinWindow} due within your ${reminderLeadDays}-day reminder window.`
              : "Cadence is quiet for the next stretch — nothing due."}
          </p>
        </div>
        <Link
          href="/apps/cma/clients?filter=enrolled"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          All enrolled
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No upcoming sends.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map((row) => (
            <li key={row.client_id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/apps/cma/clients/${row.client_id}`}
                    className="text-sm font-medium hover:text-[#D4A35C]"
                  >
                    {row.client_name ?? "Unnamed client"}
                  </Link>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {row.address ?? "—"}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-medium text-foreground">
                    {formatDueIn(row.next_due_at)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {row.cadence_days
                      ? `every ${row.cadence_days}d`
                      : "default cadence"}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent panel
// ---------------------------------------------------------------------------

function RecentPanel({ recent }: { recent: CmaRecentDelivery[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-[#D4A35C]" />
          Recent deliveries
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Last 10 cadence cycles + manual sends. Engagement updates as ESP webhooks fire.
        </p>
      </div>
      {recent.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No CMAs sent yet. Once you enroll past clients, deliveries fire on cadence and show up here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((row) => (
            <li key={row.delivery_id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/apps/cma/clients/${row.client_id}`}
                    className="text-sm font-medium hover:text-[#D4A35C]"
                  >
                    {row.client_name ?? "Unnamed client"}
                  </Link>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {row.address ?? "—"}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <RecentEngagementChip engagement={row.engagement} />
                  <div className="text-[10px] text-muted-foreground">
                    {row.delivered_at
                      ? new Date(row.delivered_at).toLocaleDateString()
                      : row.send_error
                        ? "send failed"
                        : "pending"}
                  </div>
                </div>
              </div>
              {row.send_error && (
                <div className="mt-2 text-[11px] text-rose-300">
                  {row.send_error}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentEngagementChip({
  engagement,
}: {
  engagement: CmaRecentDelivery["engagement"];
}) {
  const map = {
    complained: {
      Icon: ShieldAlert,
      label: "Complaint",
      cls: "text-rose-400 border-rose-500/50 bg-rose-500/10",
    },
    bounced: {
      Icon: AlertTriangle,
      label: "Bounced",
      cls: "text-rose-400 border-rose-500/40 bg-rose-500/5",
    },
    clicked: {
      Icon: MousePointerClick,
      label: "Clicked",
      cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
    },
    opened: {
      Icon: MailOpen,
      label: "Opened",
      cls: "text-sky-400 border-sky-500/40 bg-sky-500/5",
    },
    delivered: {
      Icon: Mail,
      label: "Delivered",
      cls: "text-muted-foreground border-border bg-card",
    },
    pending: {
      Icon: Loader2,
      label: "Pending",
      cls: "text-muted-foreground border-border bg-card",
    },
  } as const;
  const { Icon, label, cls } = map[engagement];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Engagement card
// ---------------------------------------------------------------------------

function EngagementCard({
  title,
  rates,
}: {
  title: string;
  rates: CmaEngagementRates;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#D4A35C]" />
          {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {rates.sent.toLocaleString()} sent
        </span>
      </div>
      {rates.sent === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No deliveries yet in this window.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <RateTile
            label="Open rate"
            rate={rates.open_rate}
            count={rates.opened}
            Icon={MailOpen}
            color="text-sky-400"
          />
          <RateTile
            label="Click rate"
            rate={rates.click_rate}
            count={rates.clicked}
            Icon={MousePointerClick}
            color="text-emerald-400"
          />
          <RateTile
            label="Bounce rate"
            rate={rates.bounce_rate}
            count={rates.bounced}
            Icon={AlertTriangle}
            color="text-rose-400"
            warnThreshold={0.05}
          />
          <RateTile
            label="Complaint"
            rate={rates.complaint_rate}
            count={rates.complained}
            Icon={ShieldAlert}
            color="text-rose-400"
            warnThreshold={0.003}
          />
        </div>
      )}
    </div>
  );
}

function RateTile({
  label,
  rate,
  count,
  Icon,
  color,
  warnThreshold,
}: {
  label: string;
  rate: number | null;
  count: number;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  warnThreshold?: number;
}) {
  const exceeded =
    warnThreshold !== undefined && rate !== null && rate > warnThreshold;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        exceeded
          ? "border-rose-500/50 bg-rose-500/10"
          : "border-border bg-background/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <Icon className={cn("h-3 w-3", color)} />
      </div>
      <div className="mt-1 text-lg font-semibold">
        {rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {count.toLocaleString()} total
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding state
// ---------------------------------------------------------------------------

function OnboardingState() {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <PlugZap className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Get your first CMA cadence running</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Connect your CRM, sync past clients, and pick an email connection.
        You&apos;ll be sending quarterly CMAs to past clients on autopilot
        in under 10 minutes.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {/* Wave 12: CRM + ESP connection management moved to the
            profile editor. CTAs land on the profile list — agent
            clicks into their profile and picks the CRM or Mail tab. */}
        <Link
          href="/apps/profile"
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <PlugZap className="h-3.5 w-3.5" />
          Connect CRM + email
        </Link>
        <Link
          href="/apps/cma/settings?tab=cadence"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Configure cadence
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueIn(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < -1) return `${Math.abs(days)}d overdue`;
  if (days === -1) return "1d overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  if (days < 30) return `in ${Math.round(days / 7)}w`;
  return d.toLocaleDateString();
}
