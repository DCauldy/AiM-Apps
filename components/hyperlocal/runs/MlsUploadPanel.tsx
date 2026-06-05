"use client";

import { useState } from "react";
import {
  Upload,
  CheckCircle2,
  Loader2,
  ArrowRight,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import type { HlSegment } from "@/types/hyperlocal";

interface BulkSummary {
  file_rows: number;
  file_zips: number;
  matched_segments: number;
  matched_contacts: number;
  skipped_segments: number;
  skipped_contacts: number;
}

export function MlsUploadPanel({
  runId,
  segments,
  onUploadComplete,
  onAllReady,
}: {
  runId: string;
  segments: HlSegment[];
  onUploadComplete: () => void;
  onAllReady: () => void;
}) {
  const toast = useHlToast();
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Skip sub-threshold segments — they auto-flip to 'ready' in discover.
  const fullSize = segments.filter((s) => !s.below_min_size);
  const readyCount = fullSize.filter((s) => s.status === "ready").length;
  const pendingCount = fullSize.filter((s) => s.status === "pending").length;
  const skippedCount = fullSize.filter((s) => s.status === "skipped").length;
  const lowConfidenceCount = segments.filter((s) => s.below_min_size).length;

  // Show the post-upload state if any segments are already ready/skipped
  const hasUploadedBefore = readyCount > 0 || skippedCount > 0;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/mls-upload-bulk`,
        { method: "POST", body: form }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setSummary(json.summary);
      toast.success(
        `Matched ${json.summary.matched_segments} of ${json.summary.matched_segments + json.summary.skipped_segments} segments`
      );
      onUploadComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/apps/hyperlocal/runs/${runId}/generate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generate trigger failed");
      toast.success("Generation started");
      onAllReady();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main panel */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold">Upload your MLS data</p>
          <p className="text-xs text-muted-foreground mt-1">
            One MLS export covering your service area — we'll split it by ZIP
            automatically, compute median price, days on market, list-to-sale
            ratio, and inventory per ZIP, then only generate emails for ZIPs
            where you have both contacts AND market data.
          </p>
        </div>

        {/* Upload zone OR summary */}
        {!hasUploadedBefore ? (
          <UploadZone onFile={upload} uploading={uploading} />
        ) : (
          <div className="space-y-3">
            {summary && (
              <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                  <p className="text-sm font-semibold">MLS file processed</p>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Stat
                    label="MLS rows"
                    value={summary.file_rows.toLocaleString()}
                  />
                  <Stat
                    label="ZIPs in file"
                    value={summary.file_zips.toLocaleString()}
                  />
                  <Stat
                    label="Matched"
                    value={`${summary.matched_segments} segments`}
                    sublabel={`${summary.matched_contacts.toLocaleString()} contacts`}
                    accent="emerald"
                  />
                  <Stat
                    label="Out-of-market"
                    value={`${summary.skipped_segments} skipped`}
                    sublabel={`${summary.skipped_contacts.toLocaleString()} contacts`}
                    accent="muted"
                  />
                </dl>
              </div>
            )}

            {!summary && (
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm">
                  <span className="font-semibold">{readyCount}</span> segments
                  ready · <span className="font-semibold">{skippedCount}</span>{" "}
                  skipped
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSummary(null);
                }}
                disabled={uploading}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Upload a different
                file
              </Button>
            </div>
          </div>
        )}

        {/* Replace-upload zone if user clicked "Upload a different file" */}
        {hasUploadedBefore && summary === null && readyCount + skippedCount === 0 && (
          <UploadZone onFile={upload} uploading={uploading} />
        )}

        {/* Status footer + generate button */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {pendingCount > 0 && hasUploadedBefore && (
              <p className="text-amber-500">
                {pendingCount} segment{pendingCount === 1 ? "" : "s"} still
                waiting for MLS data
              </p>
            )}
            {lowConfidenceCount > 0 && (
              <p>
                <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-500" />
                {lowConfidenceCount} small segment
                {lowConfidenceCount === 1 ? "" : "s"} marked low-confidence
                (will still generate without MLS)
              </p>
            )}
          </div>
          <Button
            onClick={startGenerate}
            disabled={
              generating || (readyCount === 0 && lowConfidenceCount === 0)
            }
            className="bg-[#E11D48] hover:bg-[#BE123C]"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting…
              </>
            ) : (
              <>
                Generate drafts <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Advanced: per-segment upload (for power users) */}
      <details
        className="rounded-lg border border-border bg-card p-4"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground">
          Advanced: upload different MLS data for specific segments
        </summary>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Use this if you want to override the bulk file with a per-ZIP
            export. Each upload here replaces the bulk-matched metrics for that
            segment.
          </p>
          <PerSegmentList runId={runId} segments={fullSize} onChange={onUploadComplete} />
        </div>
      </details>
    </div>
  );
}

function UploadZone({
  onFile,
  uploading,
}: {
  onFile: (f: File) => void;
  uploading: boolean;
}) {
  return (
    <label className="block">
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
      <div
        className={`rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors ${
          uploading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-2" />
            <p className="text-sm font-medium">Parsing your MLS file…</p>
            <p className="text-xs text-muted-foreground mt-1">
              Splitting rows by ZIP, computing metrics
            </p>
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Choose your MLS export</p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV or XLSX · up to 50 MB · must include a ZIP/Postal column
            </p>
            <Button variant="outline" size="sm" className="mt-3 pointer-events-none">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Browse files
            </Button>
          </>
        )}
      </div>
    </label>
  );
}

function Stat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "emerald" | "muted";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`text-sm font-semibold mt-0.5 ${accentClass}`}>{value}</dd>
      {sublabel && (
        <dd className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</dd>
      )}
    </div>
  );
}

/**
 * Per-segment upload list — collapsed under "Advanced" by default.
 * Retains the original per-segment workflow as an override path.
 */
function PerSegmentList({
  runId,
  segments,
  onChange,
}: {
  runId: string;
  segments: HlSegment[];
  onChange: () => void;
}) {
  const toast = useHlToast();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const uploadFor = async (segmentId: string, file: File) => {
    setUploadingId(segmentId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/segments/${segmentId}/mls-upload`,
        { method: "POST", body: form }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast.success(`Updated ${json.row_count} rows for segment`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const visible = segments.slice(0, 50);
  const overflow = segments.length - visible.length;

  return (
    <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
      {visible.map((s) => (
        <li
          key={s.id}
          className="rounded-md border border-border p-2.5 flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">
                {s.geo_label || s.geo_key}
              </p>
              {s.status === "ready" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {s.contact_count} contacts · {s.status}
            </p>
          </div>
          <label className="shrink-0">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              disabled={uploadingId !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFor(s.id, f);
                e.currentTarget.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={uploadingId !== null}
              onClick={(e) => {
                e.preventDefault();
                (
                  e.currentTarget.previousElementSibling as HTMLInputElement
                )?.click();
              }}
            >
              {uploadingId === s.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Override"
              )}
            </Button>
          </label>
        </li>
      ))}
      {overflow > 0 && (
        <li className="text-center text-[11px] text-muted-foreground py-2">
          + {overflow} more segments (scroll to see all)
        </li>
      )}
    </ul>
  );
}
