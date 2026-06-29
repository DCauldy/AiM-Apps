"use client";

import { CheckCircle2, AlertCircle, Ban, Send } from "lucide-react";
import type { HlRun, HlRecipient } from "@/types/hyperlocal";

interface RecipientCounts {
  pending: number;
  sent: number;
  suppressed: number;
  bounced: number;
  complained: number;
  failed: number;
}

export function SendProgress({
  run,
  counts,
}: {
  run: HlRun;
  counts: RecipientCounts;
}) {
  const total =
    counts.pending +
    counts.sent +
    counts.suppressed +
    counts.bounced +
    counts.complained +
    counts.failed;
  const completed = total - counts.pending;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">
            {run.phase === "completed" ? "Sent" : "Sending"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completed} of {total} ({pct}%)
          </p>
        </div>
        {run.phase === "completed" ? (
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        ) : (
          <Send className="h-5 w-5 text-[#F43F5E] animate-pulse" />
        )}
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-[#F43F5E] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
        <Stat
          label="Sent"
          value={counts.sent}
          color="text-emerald-500"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Queued"
          value={counts.pending}
          color="text-muted-foreground"
        />
        <Stat
          label="Suppressed"
          value={counts.suppressed}
          color="text-amber-500"
          icon={<Ban className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Bounced"
          value={counts.bounced + counts.complained}
          color="text-destructive"
          icon={<AlertCircle className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Failed"
          value={counts.failed}
          color="text-destructive"
          icon={<AlertCircle className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border px-2 py-2">
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wide ${color}`}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-base font-semibold mt-0.5">{value}</p>
    </div>
  );
}

export function summarizeRecipients(
  recipients: Pick<HlRecipient, "send_status">[]
): RecipientCounts {
  const counts: RecipientCounts = {
    pending: 0,
    sent: 0,
    suppressed: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
  };
  for (const r of recipients) {
    counts[r.send_status] = (counts[r.send_status] ?? 0) + 1;
  }
  return counts;
}
