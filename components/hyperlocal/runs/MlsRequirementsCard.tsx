"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Info,
} from "lucide-react";
import type { HlSegment } from "@/types/hyperlocal";

// ============================================================
// Pre-upload requirements card.
//
// Tells the agent exactly what to pull from their MLS BEFORE they
// export. Three pieces:
//   1. Per-segment status: fresh / stale / missing snapshots. The
//      killer feature for capped-MLS agents — "you already have data
//      for 3 of 5 ZIPs, only export the remaining 2."
//   2. The minimal column list every MLS export needs (whatever the
//      MLS calls them — our parser heuristically matches common
//      variants like "Sale Price", "Sold Price", "Close Price").
//   3. A callout explaining the multi-upload + snapshot-accumulation
//      strategy for MLS systems with low per-export caps.
// ============================================================

interface SnapshotStatus {
  segment_id: string;
  geo_key: string;
  geo_label: string | null;
  freshness: "fresh" | "stale" | "missing";
  latest_period: { year: number; month: number } | null;
  earliest_period: { year: number; month: number } | null;
  month_count: number;
}

interface CampaignFilters {
  property_type_filters: string[];
  price_range_low: number | null;
  price_range_high: number | null;
}

export function MlsRequirementsCard({
  runId,
  segments,
}: {
  runId: string;
  segments: HlSegment[];
}) {
  const [snapshots, setSnapshots] = useState<SnapshotStatus[] | null>(null);
  const [campaign, setCampaign] = useState<CampaignFilters | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/apps/hyperlocal/runs/${runId}/mls-snapshot-status`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) {
          setSnapshots(json.segments ?? []);
          setCampaign(json.campaign ?? null);
        }
      } catch {
        // Non-fatal — card still renders with sensible defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const pendingSegments = segments.filter(
    (s) => !s.below_min_size && (s.status === "pending" || s.status === "skipped"),
  );
  if (pendingSegments.length === 0) return null;

  const statusByGeoKey = new Map<string, SnapshotStatus>();
  for (const s of snapshots ?? []) {
    statusByGeoKey.set(normalize(s.geo_key), s);
  }

  const freshCount = pendingSegments.filter(
    (s) => statusByGeoKey.get(normalize(s.geo_key))?.freshness === "fresh",
  ).length;
  const staleCount = pendingSegments.filter(
    (s) => statusByGeoKey.get(normalize(s.geo_key))?.freshness === "stale",
  ).length;
  const missingCount = pendingSegments.length - freshCount - staleCount;

  const propertyTypes =
    campaign && campaign.property_type_filters.length > 0
      ? campaign.property_type_filters.join(", ")
      : "all property types";
  const priceRange =
    campaign && (campaign.price_range_low || campaign.price_range_high)
      ? `priced ${formatMoney(campaign.price_range_low)}–${formatMoney(campaign.price_range_high)}`
      : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Pull MLS data for these segments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            We&apos;ll match each segment to listings in your upload by ZIP code.
          </p>
        </div>
      </div>

      {/* Per-segment status grid */}
      <div className="rounded-md border border-border divide-y divide-border">
        {pendingSegments.map((seg) => {
          const status = statusByGeoKey.get(normalize(seg.geo_key));
          const freshness = status?.freshness ?? "missing";
          return (
            <div
              key={seg.id}
              className="flex items-center gap-3 px-3 py-2 text-xs"
            >
              <FreshnessBadge freshness={freshness} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground/90 truncate">
                  {seg.geo_label || seg.geo_key}
                </p>
                <p className="text-muted-foreground text-[11px] truncate">
                  {seg.contact_count} contact{seg.contact_count === 1 ? "" : "s"}
                  {status?.latest_period && (
                    <>
                      {" · "}
                      Latest snapshot:{" "}
                      {monthLabel(status.latest_period)}
                      {status.month_count > 1 && (
                        <> · {status.month_count} months on record</>
                      )}
                    </>
                  )}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {freshness === "fresh"
                  ? "Skip — already fresh"
                  : freshness === "stale"
                    ? "Refresh recommended"
                    : "Export needed"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Roll-up summary */}
      {(freshCount > 0 || staleCount > 0) && (
        <div className="text-xs text-muted-foreground rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <span className="text-foreground/90 font-medium">
              {freshCount > 0 &&
                `${freshCount} segment${freshCount === 1 ? "" : "s"} already covered.`}
              {freshCount > 0 && staleCount > 0 && " "}
              {staleCount > 0 &&
                `${staleCount} could use a refresh.`}
            </span>{" "}
            Re-uploading optional for those — runs will use your existing snapshots.
            Focus your MLS export on the {missingCount} missing segment{missingCount === 1 ? "" : "s"}.
          </div>
        </div>
      )}

      {/* Export spec — what filters to apply */}
      <div className="text-xs text-muted-foreground">
        <span className="text-foreground/90 font-medium">For each missing segment, export:</span>{" "}
        sold + active + pending listings from the past 180 days, {propertyTypes}
        {priceRange && `, ${priceRange}`}.
      </div>

      {/* Collapsible: columns the system needs */}
      <details
        className="rounded-md border border-border bg-background/40"
        open={columnsOpen}
        onToggle={(e) => setColumnsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs font-medium cursor-pointer px-3 py-2 flex items-center gap-2">
          {columnsOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Required columns in your MLS export
        </summary>
        <div className="px-3 pb-3 text-xs text-muted-foreground space-y-2">
          <p className="leading-relaxed">
            Our parser auto-detects common MLS column variants — exact naming
            doesn&apos;t need to match. You just need each of these data points
            somewhere in the export:
          </p>
          <ul className="space-y-1.5">
            {REQUIRED_COLUMNS.map((c) => (
              <li key={c.canonical} className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                <div>
                  <span className="text-foreground/90 font-medium">{c.canonical}</span>
                  <span className="opacity-70"> — also recognized as {c.aliases.join(", ")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      {/* Collapsible: MLS export caps + multi-upload strategy */}
      <details
        className="rounded-md border border-border bg-background/40"
        open={howOpen}
        onToggle={(e) => setHowOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs font-medium cursor-pointer px-3 py-2 flex items-center gap-2">
          {howOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          My MLS caps exports at 200–500 records — what do I do?
        </summary>
        <div className="px-3 pb-3 text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p>
            Run multiple exports — one per ZIP if needed — and upload them in
            sequence. Each upload writes per-ZIP snapshots that{" "}
            <strong className="text-foreground/90">accumulate across uploads</strong>.
            Run-time emails draw from accumulated snapshots, not from any
            single upload.
          </p>
          <p>
            This also means subsequent campaigns reuse snapshots from prior
            uploads. Once you&apos;ve built up 12+ months of data, the emails
            can talk about real year-over-year trends.
          </p>
        </div>
      </details>
    </div>
  );
}

function FreshnessBadge({
  freshness,
}: {
  freshness: "fresh" | "stale" | "missing";
}) {
  if (freshness === "fresh") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-500 shrink-0"
        title="Fresh snapshot — no re-upload needed"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (freshness === "stale") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-500 shrink-0"
        title="Snapshot is more than 1 month old — refresh recommended"
      >
        <Clock className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/15 text-rose-500 shrink-0"
      title="No snapshot — export needed"
    >
      <AlertCircle className="h-3.5 w-3.5" />
    </span>
  );
}

const REQUIRED_COLUMNS: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "ZIP / Postal Code",
    aliases: ["ZIP", "Postal", "Zip Code", "PostalCode"],
  },
  {
    canonical: "Status",
    aliases: ["Status", "Listing Status", "MLS Status"],
  },
  {
    canonical: "Sold Price",
    aliases: ["Sold Price", "Close Price", "Sale Price"],
  },
  {
    canonical: "List Price",
    aliases: ["List Price", "Listing Price", "Original Price"],
  },
  {
    canonical: "List Date",
    aliases: ["List Date", "Listing Date"],
  },
  {
    canonical: "Closed Date",
    aliases: ["Closed Date", "Close Date", "Sold Date"],
  },
  {
    canonical: "Days on Market",
    aliases: ["Days on Market", "DOM", "CDOM"],
  },
  {
    canonical: "Property Type",
    aliases: ["Property Type", "Sub Type", "Property Sub Type"],
  },
];

function normalize(geoKey: string): string {
  return String(geoKey).trim().toLowerCase().split("-")[0];
}

function monthLabel(p: { year: number; month: number }): string {
  const date = new Date(p.year, p.month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatMoney(n?: number | null): string {
  if (!n) return "any";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}
