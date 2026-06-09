"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Send,
  Users,
  AlertTriangle,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { HlRun } from "@/types/hyperlocal";

interface RecipientCounts {
  pending: number;
  sent: number;
  suppressed: number;
  bounced: number;
  complained: number;
  failed: number;
}

// ============================================================
// Run-complete celebration panel. Renders above SendProgress
// when phase = "completed". Closes the loop with a satisfying
// "you did it" moment instead of dropping the agent on a flat
// progress bar with no momentum to the next action.
//
// Three CTAs:
//   - View campaigns (browse run history for this campaign)
//   - Dashboard (deliverability + open rates over time)
//   - Run again now (kick off a fresh run on the same campaign)
// ============================================================

export function RunCompleteSummary({
  run,
  counts,
  campaignId,
  campaignName,
  segmentsCount,
}: {
  run: HlRun;
  counts: RecipientCounts;
  campaignId?: string | null;
  campaignName?: string;
  segmentsCount: number;
}) {
  const sent = counts.sent;
  const bounced = counts.bounced + counts.complained;
  const suppressed = counts.suppressed;
  const total =
    counts.pending +
    counts.sent +
    counts.suppressed +
    counts.bounced +
    counts.complained +
    counts.failed;
  const bouncePct =
    sent + bounced > 0 ? ((bounced / (sent + bounced)) * 100).toFixed(1) : "0.0";

  const duration = elapsedLabel(run.created_at, run.completed_at ?? null);

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8 space-y-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            Run complete
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {campaignName ? `${campaignName} — ` : ""}
            {sent.toLocaleString()} email{sent === 1 ? "" : "s"} delivered
            across {segmentsCount} segment{segmentsCount === 1 ? "" : "s"}
            {duration && ` · finished in ${duration}`}
          </p>
        </div>
      </div>

      {/* Headline stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<Send className="h-4 w-4" />}
          label="Sent"
          value={sent.toLocaleString()}
          accent="emerald"
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Recipients"
          value={total.toLocaleString()}
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Bounced"
          value={`${bounced.toLocaleString()} (${bouncePct}%)`}
          accent={bounced > 0 ? "amber" : "muted"}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="Suppressed"
          value={suppressed.toLocaleString()}
          accent={suppressed > 0 ? "muted" : "muted"}
        />
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Link
          href="/apps/hyperlocal/dashboard"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted/40 transition-colors"
        >
          View deliverability dashboard
          <ArrowRight className="h-3 w-3" />
        </Link>
        {campaignId && (
          <Link
            href={`/apps/hyperlocal/campaigns`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted/40 transition-colors"
          >
            Run history for this campaign
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          Open rates land over the next 24–48 hours.
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "muted";
}) {
  const tone =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-md bg-background/40 border border-border/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function elapsedLabel(start: string, end: string | null): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const remM = min % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h} hour${h === 1 ? "" : "s"}`;
}
