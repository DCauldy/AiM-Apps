"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HlSegment } from "@/types/hyperlocal";

const STATUS_LABELS: Record<HlSegment["status"], string> = {
  pending: "Pending MLS",
  ready: "Ready",
  rolled_up: "Rolled up",
  skipped: "Too small",
};

const STATUS_STYLES: Record<HlSegment["status"], string> = {
  pending: "bg-amber-500/10 text-amber-500",
  ready: "bg-emerald-500/10 text-emerald-500",
  rolled_up: "bg-muted text-muted-foreground",
  skipped: "bg-muted text-muted-foreground",
};

export function SegmentList({ segments }: { segments: HlSegment[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold">
          {segments.length} segment{segments.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {segments.map((s) => (
          <li
            key={s.id}
            className="px-4 py-3 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">
                  {s.geo_label || s.geo_key}
                </p>
                {s.below_min_size && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    <AlertTriangle className="h-2.5 w-2.5" /> Low
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.contact_count} contact{s.contact_count === 1 ? "" : "s"}
                {s.seller_contact_count > 0 &&
                  ` · ${s.seller_contact_count} seller`}
                {s.buyer_contact_count > 0 &&
                  ` · ${s.buyer_contact_count} buyer`}
                {s.below_min_size && " · no MLS needed"}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide shrink-0",
                STATUS_STYLES[s.status]
              )}
            >
              {STATUS_LABELS[s.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
