"use client";

import { useRef, useState } from "react";
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
import { MlsRequirementsCard } from "@/components/hyperlocal/runs/MlsRequirementsCard";
import {
  MlsColumnConfirmModal,
  type CanonicalField,
  type PreviewResponse,
} from "@/components/hyperlocal/runs/MlsColumnConfirmModal";
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

  // Two-step upload state: file is held in browser between preview +
  // commit so we don't have to stash it server-side.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  // Explicit "user wants to upload another file" flag — needed because
  // `summary` is null whenever you arrive without a fresh session upload
  // (page reload, back-navigation), so clearing summary alone isn't a
  // signal we can use to show the replace-zone.
  const [showReplaceZone, setShowReplaceZone] = useState(false);

  // Batch upload state — when the user picks multiple files, we
  // process them serially. queueRef holds the remaining files;
  // batchTotal/batchPosition drive the modal's "File 2 of 5" header.
  // Ref instead of state because closures inside commit() need the
  // current queue value when chaining.
  const queueRef = useRef<File[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchPosition, setBatchPosition] = useState(0);
  const [batchTotalsAgg, setBatchTotalsAgg] = useState({
    matched: 0,
    skipped: 0,
    contacts: 0,
  });

  // Skip sub-threshold segments — they auto-flip to 'ready' in discover.
  const fullSize = segments.filter((s) => !s.below_min_size);
  const readyCount = fullSize.filter((s) => s.status === "ready").length;
  const pendingCount = fullSize.filter((s) => s.status === "pending").length;
  const skippedCount = fullSize.filter((s) => s.status === "skipped").length;
  const lowConfidenceCount = segments.filter((s) => s.below_min_size).length;

  // Show the post-upload state if any segments are already ready/skipped
  const hasUploadedBefore = readyCount > 0 || skippedCount > 0;

  // Step 1: parse the file via /preview to surface detected columns +
  // match preview, opens the confirmation modal. No DB writes yet.
  const upload = async (file: File) => {
    setPendingFile(file);
    setPreviewing(true);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/mls-upload-preview`,
        { method: "POST", body: form },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed");
      setPreview(json as PreviewResponse);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
      setPendingFile(null);
    } finally {
      setPreviewing(false);
      setUploading(false);
    }
  };

  // Step 2: re-POST the same file plus the user's column overrides to
  // the committing endpoint. Backend merges overrides over its
  // auto-detection before processing.
  const commit = async (overrides: Partial<Record<CanonicalField, string>>) => {
    if (!pendingFile) return;
    setCommitting(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      if (Object.keys(overrides).length > 0) {
        form.append("column_overrides", JSON.stringify(overrides));
      }
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/mls-upload-bulk`,
        { method: "POST", body: form },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setSummary(json.summary);
      toast.success(
        `Matched ${json.summary.matched_segments} of ${json.summary.matched_segments + json.summary.skipped_segments} segments`,
      );
      setPreview(null);
      setPendingFile(null);

      // Aggregate stats across the batch so we can show one summary
      // toast at the end instead of N "Matched 3 segments" toasts.
      setBatchTotalsAgg((prev) => ({
        matched: prev.matched + json.summary.matched_segments,
        skipped: prev.skipped + json.summary.skipped_segments,
        contacts: prev.contacts + json.summary.matched_contacts,
      }));

      // Chain to the next file in the queue, or wrap up the batch.
      const next = queueRef.current.shift();
      if (next) {
        setBatchPosition((p) => p + 1);
        await upload(next);
      } else {
        if (batchTotal > 1) {
          toast.success(
            `Uploaded ${batchTotal} files — matched ${batchTotalsAgg.matched + json.summary.matched_segments} segments total`,
          );
        }
        setBatchTotal(0);
        setBatchPosition(0);
        setBatchTotalsAgg({ matched: 0, skipped: 0, contacts: 0 });
        setShowReplaceZone(false);
      }
      onUploadComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      // Stop the batch on first error — user can retry or fix the file.
      queueRef.current = [];
      setBatchTotal(0);
      setBatchPosition(0);
    } finally {
      setCommitting(false);
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    setPendingFile(null);
    // Cancelling mid-batch aborts the remaining files too.
    queueRef.current = [];
    setBatchTotal(0);
    setBatchPosition(0);
  };

  // Entry point for batch (multi-file) upload. Single-file uploads
  // hit this with a 1-length array and behave exactly like before.
  const startBatch = (files: File[]) => {
    if (files.length === 0) return;
    queueRef.current = files.slice(1);
    setBatchTotal(files.length);
    setBatchPosition(1);
    setBatchTotalsAgg({ matched: 0, skipped: 0, contacts: 0 });
    void upload(files[0]);
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
      {/* Column-mapping confirmation modal — opens after the user picks
          a file. The user confirms (or adjusts) the detected mapping,
          then commit fires the actual upload. */}
      <MlsColumnConfirmModal
        open={!!preview}
        preview={preview}
        onCancel={cancelPreview}
        onConfirm={commit}
        committing={committing}
        batchPosition={batchTotal > 1 ? batchPosition : undefined}
        batchTotal={batchTotal > 1 ? batchTotal : undefined}
      />

      {/* Pre-upload requirements card — shows which segments already
          have snapshots, which need data, and the canonical column
          list. Hidden once everything is ready. */}
      {!hasUploadedBefore && pendingCount > 0 && (
        <MlsRequirementsCard runId={runId} segments={segments} />
      )}

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
          <UploadZone onFiles={startBatch} uploading={uploading} />
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
              {!showReplaceZone ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSummary(null);
                    setShowReplaceZone(true);
                  }}
                  disabled={uploading}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Upload a different
                  file
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReplaceZone(false)}
                  disabled={uploading}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Replace-upload zone if user clicked "Upload a different file" */}
        {hasUploadedBefore && showReplaceZone && (
          <UploadZone onFiles={startBatch} uploading={uploading} />
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
  onFiles,
  uploading,
}: {
  onFiles: (files: File[]) => void;
  uploading: boolean;
}) {
  return (
    <label className="block">
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        multiple
        disabled={uploading}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
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
            <p className="text-sm font-medium">Choose your MLS exports</p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV or XLSX · pick one file or many at once (capped-MLS agents:
              select all your per-ZIP exports together) · 50 MB each · ZIP/Postal column required
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
