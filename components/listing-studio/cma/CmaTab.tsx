"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Upload,
  Database,
  FileText,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ListingRow,
  CmaRunRow,
  AdjustedComp,
} from "@/types/listing-studio";

// ============================================================
// CMA tab — workspace experience for one listing.
//
// Render states:
//   - Missing facts: warn + link to Overview to edit
//   - No run yet: "Generate CMA" CTA + source toggle + CSV upload
//   - Running: poll every 4s; spinner + last-checked time
//   - Failed: surface pipeline_error + retry CTA
//   - Ready:  recommendation panel · grid table · narrative · memo
// ============================================================

type CompSourceChoice = "api_only" | "csv_only" | "both";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 60; // 4 minutes ceiling

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function hasRequiredFacts(listing: ListingRow): boolean {
  const f = listing.property_facts ?? {};
  return Boolean(f.zip && f.living_area_sqft && f.beds != null && f.baths != null);
}

export function CmaTab({ listing }: { listing: ListingRow }) {
  const [run, setRun] = useState<CmaRunRow | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceChoice, setSourceChoice] = useState<CompSourceChoice>("api_only");
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const factsOk = hasRequiredFacts(listing);

  // Fetch the latest run; called on mount + polling + post-generate.
  const fetchRun = useCallback(async (): Promise<CmaRunRow | null> => {
    const res = await fetch(
      `/api/apps/listing-studio/listings/${listing.id}/cma`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.run as CmaRunRow | null) ?? null;
  }, [listing.id]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchRun();
        if (!cancelled) setRun(latest);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchRun]);

  // Polling loop while `generating`. Polls for either a new row with no
  // error OR a row with a pipeline_error newer than our baseline.
  useEffect(() => {
    if (!generating) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }
    const baselineId = run?.id ?? null;

    const tick = async () => {
      pollAttemptsRef.current += 1;
      const latest = await fetchRun();
      const isNew = latest && latest.id !== baselineId;
      if (isNew) {
        setRun(latest);
        setGenerating(false);
        pollAttemptsRef.current = 0;
        return;
      }
      if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
        setGenerating(false);
        setError(
          "CMA is still running — it's taking longer than usual. Refresh in a minute.",
        );
        return;
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [generating, fetchRun, run?.id]);

  async function handleGenerate() {
    if (!factsOk) return;
    setError(null);
    setGenerating(true);
    pollAttemptsRef.current = 0;

    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/cma`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            useApi: sourceChoice !== "csv_only",
            useCsv: sourceChoice !== "api_only",
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to start CMA");
        setGenerating(false);
        return;
      }
    } catch {
      setError("Network error — try again.");
      setGenerating(false);
    }
  }

  async function handleCsvUpload(file: File) {
    setUploadStatus(null);
    setUploadingCsv(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/comps-upload`,
        { method: "POST", body: form },
      );
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus(data?.error ?? "Upload failed");
      } else {
        setUploadStatus(`Uploaded — ${data.rowCount} rows parsed.`);
        if (sourceChoice === "api_only") setSourceChoice("both");
      }
    } catch {
      setUploadStatus("Network error — try again.");
    } finally {
      setUploadingCsv(false);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (!factsOk) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Add property facts before running a CMA
            </p>
            <p className="text-xs text-muted-foreground">
              We need at minimum: ZIP, living area (sqft), beds, and baths.
              Edit the listing facts in the Overview tab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingInitial) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-10 text-center">
        <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ControlBar
        sourceChoice={sourceChoice}
        onSourceChange={setSourceChoice}
        onGenerate={handleGenerate}
        onCsvUpload={handleCsvUpload}
        uploadingCsv={uploadingCsv}
        uploadStatus={uploadStatus}
        generating={generating}
        hasExistingRun={!!run && !run.pipeline_error}
      />

      {error && (
        <ErrorBanner message={error} />
      )}

      {generating && <RunningPanel />}

      {run && run.pipeline_error && !generating && (
        <FailedPanel
          message={run.pipeline_error}
          onRetry={handleGenerate}
        />
      )}

      {run && !run.pipeline_error && !generating && (
        <ReadyPanel run={run} />
      )}

      {!run && !generating && (
        <EmptyPanel />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top control bar — source toggle, generate button, CSV upload
// ---------------------------------------------------------------------------

function ControlBar({
  sourceChoice,
  onSourceChange,
  onGenerate,
  onCsvUpload,
  uploadingCsv,
  uploadStatus,
  generating,
  hasExistingRun,
}: {
  sourceChoice: CompSourceChoice;
  onSourceChange: (c: CompSourceChoice) => void;
  onGenerate: () => void;
  onCsvUpload: (f: File) => void;
  uploadingCsv: boolean;
  uploadStatus: string | null;
  generating: boolean;
  hasExistingRun: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const SOURCE_OPTIONS: { value: CompSourceChoice; label: string }[] = [
    { value: "api_only", label: "Use API comps" },
    { value: "csv_only", label: "Use CSV only" },
    { value: "both", label: "Use both" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSourceChange(opt.value)}
              className={cn(
                "text-xs px-2.5 py-1 rounded transition-colors",
                sourceChoice === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.value === "api_only" && <Database className="inline h-3 w-3 mr-1" />}
              {opt.value === "csv_only" && <FileText className="inline h-3 w-3 mr-1" />}
              {opt.value === "both" && <Sparkles className="inline h-3 w-3 mr-1" />}
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCsvUpload(file);
              e.target.value = ""; // allow re-upload of same file
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCsv || generating}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/40 transition-colors disabled:opacity-50"
          >
            {uploadingCsv ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Upload comps CSV
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)" }}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : hasExistingRun ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {hasExistingRun ? "Regenerate CMA" : "Generate CMA"}
          </button>
        </div>
      </div>

      {uploadStatus && (
        <p className="text-[11px] text-muted-foreground">{uploadStatus}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State panels
// ---------------------------------------------------------------------------

function EmptyPanel() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <TrendingUp className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">No CMA yet</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Generate a CMA to pull recent solds, run the adjustment grid, and
        produce a seller-facing narrative + internal pricing memo.
      </p>
    </div>
  );
}

function RunningPanel() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-10 text-center">
      <Loader2 className="h-7 w-7 mx-auto text-[#D4A35C] animate-spin mb-3" />
      <p className="text-sm font-medium text-foreground">Running the CMA…</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Pulling comps, applying adjustments, drafting narrative + memo. This
        usually takes 20–45 seconds.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
      <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
      <p className="text-xs text-destructive">{message}</p>
    </div>
  );
}

function FailedPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-destructive">
            CMA generation failed
          </p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/40"
      >
        <RefreshCw className="inline h-3 w-3 mr-1" /> Try again
      </button>
    </div>
  );
}

function ReadyPanel({ run }: { run: CmaRunRow }) {
  return (
    <div className="space-y-6">
      <RecommendationPanel run={run} />
      {run.comps && run.comps.length > 0 && (
        <AdjustmentGridTable comps={run.comps} />
      )}
      <DocumentPanel
        label="Seller-facing narrative"
        content={run.seller_narrative_md}
      />
      <DocumentPanel
        label="Internal pricing memo"
        content={run.internal_memo_md}
        tone="memo"
      />
      <p className="text-[11px] text-muted-foreground text-right">
        Generated {new Date(run.generated_at).toLocaleString()}
        {run.comps_source ? ` · source: ${run.comps_source}` : ""}
      </p>
    </div>
  );
}

function RecommendationPanel({ run }: { run: CmaRunRow }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <PriceCard
        label="Appraised value"
        sublabel="Grid median"
        cents={run.appraised_value_cents}
      />
      <PriceCard
        label="Recommended list"
        sublabel="60/40 marketable/appraised"
        cents={run.recommended_price_cents}
        emphasized
      />
      <PriceCard
        label="Marketable value"
        sublabel="Top-tertile mean"
        cents={run.marketable_value_cents}
      />
    </div>
  );
}

function PriceCard({
  label,
  sublabel,
  cents,
  emphasized,
}: {
  label: string;
  sublabel: string;
  cents: number | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        emphasized
          ? "border-[#D4A35C]/50 bg-[#D4A35C]/5"
          : "border-border bg-card",
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-sans font-bold",
          emphasized ? "text-xl text-[#D4A35C]" : "text-lg text-foreground",
        )}
      >
        {dollars(cents)}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
    </div>
  );
}

function AdjustmentGridTable({ comps }: { comps: AdjustedComp[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Adjustment grid ({comps.length} comps)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Bd/Ba</th>
              <th className="px-3 py-2 font-medium text-right">Sqft</th>
              <th className="px-3 py-2 font-medium text-right">Sold</th>
              <th className="px-3 py-2 font-medium text-right">Adj.</th>
              <th className="px-3 py-2 font-medium text-right">Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2 max-w-[14rem] truncate" title={c.address ?? ""}>
                  {c.address ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {c.beds ?? "—"}/{c.baths ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {c.living_area_sqft?.toLocaleString() ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">{dollars(c.sold_price_cents)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right",
                    c.total_adjustment_cents > 0 && "text-emerald-500",
                    c.total_adjustment_cents < 0 && "text-rose-500",
                  )}
                  title={c.adjustments.map((a) => `${a.feature}: ${a.reason}`).join(" · ")}
                >
                  {c.total_adjustment_cents > 0 ? "+" : ""}
                  {dollars(c.total_adjustment_cents)}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {dollars(c.adjusted_value_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentPanel({
  label,
  content,
  tone = "narrative",
}: {
  label: string;
  content: string | null;
  tone?: "narrative" | "memo";
}) {
  if (!content) return null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <CopyButton text={content} />
      </div>
      <div
        className={cn(
          "px-5 py-4 prose prose-sm max-w-none dark:prose-invert",
          tone === "memo" && "text-xs",
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-[11px] text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // no-op
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

