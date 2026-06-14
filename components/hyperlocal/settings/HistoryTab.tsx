"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";

// ============================================================
// Historical MLS data tab.
//
// Drop zone for past MLS exports. Each file is parsed server-side
// into per-(geo, month) snapshots in hl_market_snapshots, which
// the email renderer + writer prompt use to talk about YoY / 3-year
// trends.
//
// Optional — agents can send campaigns without ever uploading
// history. The richer reports just kick in once enough months
// accumulate.
// ============================================================

type FileStatus =
  | { state: "queued" }
  | { state: "uploading" }
  | { state: "done"; summary: BackfillSummary }
  | { state: "error"; error: string };

interface BackfillSummary {
  filename: string;
  file_rows: number;
  zips: number;
  snapshots_upserted: number;
  months_covered: number;
}

interface CoverageRow {
  geo_key: string;
  earliest: string;
  latest: string;
  count: number;
}

export function HistoryTab() {
  const toast = useHlToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Array<{ id: string; file: File; status: FileStatus }>>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loadingCoverage, setLoadingCoverage] = useState(true);

  const refreshCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/hyperlocal/mls/backfill");
      const json = await res.json();
      if (res.ok) setCoverage(json.coverage ?? []);
    } finally {
      setLoadingCoverage(false);
    }
  }, []);

  useEffect(() => {
    void refreshCoverage();
  }, [refreshCoverage]);

  const handleFiles = (incoming: FileList | File[]) => {
    const added = Array.from(incoming).map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      status: { state: "queued" as const },
    }));
    setFiles((prev) => [...prev, ...added]);
    void processQueue(added);
  };

  const processQueue = async (entries: Array<{ id: string; file: File }>) => {
    for (const entry of entries) {
      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, status: { state: "uploading" } } : f)),
      );
      try {
        const form = new FormData();
        form.append("file", entry.file);
        const res = await fetch("/api/apps/hyperlocal/mls/backfill", {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: { state: "done", summary: json.summary } }
              : f,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: { state: "error", error: msg } } : f,
          ),
        );
        toast.error(`${entry.file.name}: ${msg}`);
      }
    }
    await refreshCoverage();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const totalMonths = coverage.reduce((acc, c) => acc + c.count, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Historical MLS data</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Upload past monthly MLS exports — we distill each into per-ZIP × per-month
          snapshots and use them to power year-over-year and 3-year trend lines in
          your emails. Re-uploading the same month overwrites cleanly.
        </p>
        <p className="text-xs text-muted-foreground/80 mt-2">
          Optional — your campaigns work without history. Trend rendering kicks in
          as soon as enough months accumulate for a ZIP.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-muted/30 p-8 text-center cursor-pointer transition-colors"
      >
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop MLS exports here, or click to pick files</p>
        <p className="text-xs text-muted-foreground mt-1">
          CSV / XLSX / JSON. Each file should include a ZIP column and a closed-date or list-date column.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.json"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* In-flight uploads */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            This session
          </p>
          {files.map((f) => (
            <FileRow key={f.id} entry={f} />
          ))}
        </div>
      )}

      {/* Coverage so far */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Coverage so far</h3>
          {coverage.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {coverage.length} {coverage.length === 1 ? "ZIP" : "ZIPs"} ·{" "}
              {totalMonths} {totalMonths === 1 ? "month" : "months"} total
            </span>
          )}
        </div>
        {loadingCoverage ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : coverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Drop a few monthly exports above and they&apos;ll show up
            grouped by ZIP.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {coverage.map((c) => (
              <li
                key={c.geo_key}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-mono text-xs sm:text-sm">{c.geo_key}</span>
                <span className="text-xs text-muted-foreground">
                  {c.earliest} → {c.latest}
                  <span className="ml-2 text-foreground/80">
                    ({c.count} {c.count === 1 ? "month" : "months"})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileRow({
  entry,
}: {
  entry: { id: string; file: File; status: FileStatus };
}) {
  const { file, status } = entry;
  return (
    <div className="rounded-md border border-border bg-card p-3 flex items-center gap-3">
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatStatus(status, file.size)}
        </p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status.state === "uploading")
    return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
  if (status.state === "done")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status.state === "error")
    return <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />;
  return <Upload className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function formatStatus(status: FileStatus, sizeBytes: number): string {
  const kb = (sizeBytes / 1024).toFixed(0);
  switch (status.state) {
    case "queued":
      return `${kb} KB · queued`;
    case "uploading":
      return `${kb} KB · processing…`;
    case "done": {
      const s = status.summary;
      return `${s.zips} ${s.zips === 1 ? "ZIP" : "ZIPs"} · ${s.snapshots_upserted} snapshots · ${s.months_covered} month-slots`;
    }
    case "error":
      return status.error;
  }
}
