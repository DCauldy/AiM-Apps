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
  Target,
  Lightbulb,
  Shield,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { listingStudioStaticMapUrl } from "@/lib/listing-studio/mapbox";
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

// Display label for the comps_source enum stored on ls_cma_runs.
// "rapidapi" reads as too technical; "AI" matches the source-toggle copy.
function formatCompsSource(source: string): string {
  switch (source) {
    case "rapidapi":
      return "AI";
    case "csv":
      return "CSV";
    case "both":
      return "AI + CSV";
    default:
      return source;
  }
}

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
        <ReadyPanel
          run={run}
          listing={listing}
          zestimateCents={
            (listing.property_facts ?? {}).estimated_value_cents ?? null
          }
        />
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
    { value: "api_only", label: "Use AI Comps" },
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

function ReadyPanel({
  run,
  listing,
  zestimateCents,
}: {
  run: CmaRunRow;
  listing: ListingRow;
  zestimateCents: number | null;
}) {
  const compCount = run.comps?.length ?? 0;
  // Low-confidence floor: <3 comps produces statistically meaningless
  // median + top-tertile. Hard-floor at 1 (otherwise the grid produced
  // no rows; pipeline would have failed). Soft warning between 1–2.
  const lowConfidence = compCount > 0 && compCount < 3;

  return (
    <div className="space-y-6">
      <SubjectHero listing={listing} />
      {lowConfidence && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-500 dark:text-amber-400">
            Low confidence: only {compCount} comp{compCount === 1 ? "" : "s"} survived filtering.
            Widen the radius or months-back and regenerate for a stronger grid.
          </p>
        </div>
      )}
      <RecommendationPanel run={run} zestimateCents={zestimateCents} />
      {run.comps && run.comps.length > 0 && <CompCardList comps={run.comps} />}
      <NarrativeCards markdown={run.seller_narrative_md} />
      <MemoCards markdown={run.internal_memo_md} />
      <p className="text-[11px] text-muted-foreground text-right">
        Generated {new Date(run.generated_at).toLocaleString()}
        {run.comps_source
          ? ` · source: ${formatCompsSource(run.comps_source)}`
          : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject hero — Mapbox satellite as backdrop, glass card with the
// subject thumbnail + facts overlaying. Falls back gracefully when
// coords or images are missing.
// ---------------------------------------------------------------------------
function SubjectHero({ listing }: { listing: ListingRow }) {
  const facts = listing.property_facts ?? {};
  const image = facts.image_url ?? null;
  const mapUrl = listingStudioStaticMapUrl(facts.latitude, facts.longitude, {
    width: 1280,
    height: 480,
    zoom: 16,
  });

  const factChips: string[] = [
    facts.beds != null ? `${facts.beds} BD` : "",
    facts.baths != null ? `${facts.baths} BA` : "",
    facts.living_area_sqft != null
      ? `${facts.living_area_sqft.toLocaleString()} SQFT`
      : "",
    facts.year_built != null ? `BUILT ${facts.year_built}` : "",
    facts.lot_area_sqft != null
      ? lot_area_label(facts.lot_area_sqft)
      : "",
  ].filter(Boolean);

  const stageLabel = listing.stage; // "prospect" | "active" | "archived"
  const stageStyle =
    stageLabel === "active"
      ? "border-[#D4A35C]/60 text-[#D4A35C] bg-[#D4A35C]/15"
      : stageLabel === "archived"
        ? "border-white/20 text-white/60 bg-white/10"
        : "border-white/30 text-white/85 bg-white/10";

  const zillowUrl = facts.zpid
    ? `https://www.zillow.com/homedetails/${facts.zpid}_zpid/`
    : null;

  return (
    <div className="relative rounded-lg border border-border overflow-hidden h-[360px] bg-card">
      {/* Backdrop — Mapbox dark cartographic when we have coords,
          otherwise a plain slate gradient. */}
      {mapUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${mapUrl}")` }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E293B] to-[#0f172a]" />
      )}

      {/* Dark gradient overlay — heavier at bottom where the card sits. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10 pointer-events-none" />

      {/* Top-right eyebrow */}
      <div className="absolute top-3 right-3">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm border border-white/15">
          Subject property
        </span>
      </div>

      {/* Bottom — glass card. Left: thumbnail + address + fact chips.
          Right: stage + Zestimate + Zillow link. Visual divider between
          the two columns. */}
      <div className="absolute inset-x-3 bottom-3">
        <div className="flex items-stretch gap-4 rounded-md bg-black/60 backdrop-blur-md border border-white/15 p-3">
          {/* Photo */}
          <div className="w-[100px] h-[100px] shrink-0 rounded overflow-hidden bg-white/5">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={listing.address}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40">
                <FileText className="h-6 w-6" />
              </div>
            )}
          </div>

          {/* Address + chips */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
            <p className="text-lg font-semibold text-white leading-tight truncate">
              {listing.address}
            </p>
            {factChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {factChips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider text-white/90 bg-white/10 border border-white/15"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/60 italic">
                Facts not set — edit on the Overview tab
              </p>
            )}
          </div>

          {/* Right column — stage + Zestimate + Zillow link.
              Visual divider on the left edge using border-l. */}
          <div className="hidden md:flex flex-col items-end justify-center gap-1.5 pl-4 border-l border-white/10 min-w-[140px]">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider capitalize",
                stageStyle,
              )}
            >
              {stageLabel}
            </span>
            {facts.estimated_value_cents != null && (
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider text-white/50">
                  Zestimate
                </p>
                <p className="text-sm font-semibold text-white/90 font-mono leading-tight">
                  {dollars(facts.estimated_value_cents)}
                </p>
              </div>
            )}
            {zillowUrl && (
              <a
                href={zillowUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-white/70 hover:text-white underline underline-offset-2"
              >
                View on Zillow ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function lot_area_label(sqft: number): string {
  // Show as acres once we cross ~10K sqft — reads more naturally for
  // larger residential lots. Keep sqft for everything else.
  if (sqft >= 10_000) {
    const acres = sqft / 43_560;
    return `${acres.toFixed(acres < 1 ? 2 : 1)} ACRE LOT`;
  }
  return `${sqft.toLocaleString()} SQFT LOT`;
}

function RecommendationPanel({
  run,
  zestimateCents,
}: {
  run: CmaRunRow;
  zestimateCents: number | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PriceCard
          label="Estimated value"
          sublabel="Grid median (adjusted comps)"
          cents={run.appraised_value_cents}
        />
        <PriceCard
          label="Recommended list"
          sublabel="60/40 marketable/estimated"
          cents={run.recommended_price_cents}
          emphasized
        />
        <PriceCard
          label="Marketable value"
          sublabel="Top-tertile mean"
          cents={run.marketable_value_cents}
        />
      </div>
      {zestimateCents !== null && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Zillow Zestimate <span className="opacity-60">(reference only — not part of analysis)</span>
          </span>
          <span className="font-mono font-medium text-foreground">
            {dollars(zestimateCents)}
          </span>
        </div>
      )}
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

function CompCardList({ comps }: { comps: AdjustedComp[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Adjustment grid · {comps.length} comp{comps.length === 1 ? "" : "s"}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Hover a card to see per-feature adjustment math.
        </p>
      </div>
      <div className="divide-y divide-border">
        {comps.map((c, i) => (
          <CompCard key={i} comp={c} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

function CompCard({ comp, index }: { comp: AdjustedComp; index: number }) {
  const adjPositive = comp.total_adjustment_cents > 0;
  const adjNegative = comp.total_adjustment_cents < 0;
  return (
    <div className="group relative px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-20 h-16 shrink-0 rounded-md overflow-hidden bg-muted/40 relative">
          {comp.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comp.image_url}
              alt={comp.address ?? `Comp ${index}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
              <FileText className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {comp.address ?? `Comp ${index}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[
              comp.beds != null ? `${comp.beds} bd` : null,
              comp.baths != null ? `${comp.baths} ba` : null,
              comp.living_area_sqft != null
                ? `${comp.living_area_sqft.toLocaleString()} sqft`
                : null,
              comp.year_built != null ? `built ${comp.year_built}` : null,
              comp.sold_date ? `sold ${comp.sold_date}` : null,
              comp.distance_mi != null ? `${comp.distance_mi.toFixed(1)} mi` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-xs text-muted-foreground">Sold</p>
          <p className="text-sm font-medium text-foreground">
            {dollars(comp.sold_price_cents)}
          </p>
        </div>
        <div className="text-right shrink-0 w-20">
          <p className="text-xs text-muted-foreground">Adjustment</p>
          <p
            className={cn(
              "text-sm font-medium",
              adjPositive && "text-emerald-400",
              adjNegative && "text-rose-400",
              !adjPositive && !adjNegative && "text-muted-foreground",
            )}
          >
            {adjPositive ? "+" : ""}
            {dollars(comp.total_adjustment_cents)}
          </p>
        </div>
        <div className="text-right shrink-0 w-24">
          <p className="text-xs text-muted-foreground">Adjusted</p>
          <p className="text-sm font-semibold text-foreground">
            {dollars(comp.adjusted_value_cents)}
          </p>
        </div>
      </div>

      {/* Hover-reveal adjustment breakdown — CSS-only, no JS state */}
      {comp.adjustments.length > 0 && (
        <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
          <div className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
              {comp.adjustments.map((a, j) => (
                <div key={j} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "font-mono shrink-0 w-16 text-right",
                      a.delta_cents > 0 && "text-emerald-400",
                      a.delta_cents < 0 && "text-rose-400",
                      a.delta_cents === 0 && "text-muted-foreground",
                    )}
                  >
                    {a.delta_cents > 0 ? "+" : ""}
                    {dollars(a.delta_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground/70 font-medium capitalize">
                      {a.feature.replace(/_/g, " ")}:
                    </span>{" "}
                    {a.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card-based narrative + memo renderers
//
// The CMA's seller-facing narrative and internal memo both come back as
// markdown with predictable H2 (narrative) / H3 (memo) sections. Rather
// than render walls of prose, split on the headings and present each
// section as a discrete card with an icon — far more scannable and the
// agent can read aloud one section at a time during a listing presentation.
// ---------------------------------------------------------------------------

interface MdSection {
  heading: string;
  body: string;
}

/** Split markdown into sections at heading level `n` (1-6). Strips the
 *  rendering-syntax cruft we sometimes get back from the LLM:
 *    "## **The Recommendation**"  →  "The Recommendation"
 *    "### __TL;DR__"              →  "TL;DR"
 */
function splitMarkdownSections(md: string | null, level: number): MdSection[] {
  if (!md) return [];
  const prefix = "#".repeat(level) + " ";
  const lines = md.split("\n");
  const sections: MdSection[] = [];
  let current: MdSection | null = null;
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      if (current) sections.push(current);
      const raw = line.slice(prefix.length).trim();
      // Strip surrounding **bold** / __bold__ / *italic* — the LLM
      // sometimes wraps the heading text and our renderer doesn't
      // re-parse it, so it shows as literal asterisks.
      const cleaned = raw
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .replace(/^__(.+)__$/, "$1")
        .replace(/^\*(.+)\*$/, "$1")
        .trim();
      current = { heading: cleaned, body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
    // Lines before the first heading are intentionally dropped — the
    // prompt always opens with a heading.
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, body: s.body.trim() }));
}

// Per-section icon + color hint, matched on a token in the heading.
// Falls through to a neutral default for unknown sections (so prompt
// changes don't break rendering).
function sectionVisuals(heading: string): {
  icon: React.ReactNode;
  accent: string;
  bg: string;
} {
  const h = heading.toLowerCase();
  if (h.includes("recommend")) {
    return {
      icon: <Sparkles className="h-4 w-4" />,
      accent: "text-[#D4A35C]",
      bg: "bg-[#D4A35C]/10",
    };
  }
  if (h.includes("how") || h.includes("analysis") || h.includes("math")) {
    return {
      icon: <Database className="h-4 w-4" />,
      accent: "text-sky-300",
      bg: "bg-sky-500/10",
    };
  }
  if (h.includes("strategy") || h.includes("position")) {
    return {
      icon: <Target className="h-4 w-4" />,
      accent: "text-emerald-300",
      bg: "bg-emerald-500/10",
    };
  }
  if (h.includes("tl;dr") || h.includes("summary")) {
    return {
      icon: <Lightbulb className="h-4 w-4" />,
      accent: "text-amber-300",
      bg: "bg-amber-500/10",
    };
  }
  if (h.includes("risk") || h.includes("caveat")) {
    return {
      icon: <AlertCircle className="h-4 w-4" />,
      accent: "text-rose-300",
      bg: "bg-rose-500/10",
    };
  }
  if (h.includes("counter") || h.includes("objection")) {
    return {
      icon: <Shield className="h-4 w-4" />,
      accent: "text-violet-300",
      bg: "bg-violet-500/10",
    };
  }
  return {
    icon: <FileText className="h-4 w-4" />,
    accent: "text-foreground",
    bg: "bg-muted/40",
  };
}

function NarrativeCards({ markdown }: { markdown: string | null }) {
  const sections = splitMarkdownSections(markdown, 2);
  if (sections.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Seller-facing narrative
        </h3>
        {markdown && <CopyButton text={markdown} />}
      </div>
      <div className="p-3 space-y-3">
        {sections.map((s) => (
          <SectionCard key={s.heading} section={s} size="lg" />
        ))}
      </div>
    </div>
  );
}

function MemoCards({ markdown }: { markdown: string | null }) {
  const sections = splitMarkdownSections(markdown, 3);
  if (sections.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Internal pricing memo
        </h3>
        {markdown && <CopyButton text={markdown} />}
      </div>
      <div className="p-3 space-y-2">
        {sections.map((s) => (
          <SectionCard key={s.heading} section={s} size="sm" />
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  size,
}: {
  section: MdSection;
  size: "sm" | "lg";
}) {
  const { icon, accent, bg } = sectionVisuals(section.heading);
  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex items-center justify-center w-6 h-6 rounded",
            bg,
            accent,
          )}
        >
          {icon}
        </span>
        <h4 className={cn("font-semibold text-foreground text-sm")}>
          {section.heading}
        </h4>
      </div>
      <div
        className={cn(
          "prose prose-invert max-w-none",
          size === "lg" ? "prose-sm" : "prose-xs text-xs leading-relaxed",
          // Tighten prose spacing inside cards.
          "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
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

