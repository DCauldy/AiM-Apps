"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// Post-upload column-mapping confirmation modal.
//
// Shows the agent what our parser auto-detected from their MLS file
// (Sale Price → "Sale Price", ZIP → "Postal Code", etc.) with each
// canonical field's dropdown selectable so they can override silent
// mis-detections before commit. Also previews:
//   - The first 3 file rows so they can visually confirm mapping
//   - Which run segments will match vs be skipped if they commit
//
// On confirm, the parent re-POSTs the file to /mls-upload-bulk with
// the user's overrides as JSON. The preview file holds in browser
// memory between the preview and commit POSTs — sending the file
// twice (~100-500KB) is cheaper than backend file stash + cleanup.
// ============================================================

export interface PreviewResponse {
  filename: string;
  format: string;
  row_count: number;
  columns: string[];
  detected: Partial<Record<CanonicalField, string>>;
  sample_rows: Array<Record<string, string>>;
  file_zips_count: number;
  match_preview: {
    matched: Array<{
      segment_id: string;
      geo_key: string;
      geo_label: string | null;
      file_row_count: number;
    }>;
    skipped: Array<{
      segment_id: string;
      geo_key: string;
      geo_label: string | null;
    }>;
  };
}

export type CanonicalField =
  | "zip"
  | "status"
  | "price"
  | "list_price"
  | "sold_price"
  | "list_date"
  | "closed_date"
  | "days_on_market"
  | "property_type"
  | "city";

const FIELD_META: Array<{
  key: CanonicalField;
  label: string;
  required: boolean;
  hint: string;
}> = [
  { key: "zip", label: "ZIP / Postal", required: true, hint: "Groups listings to your segments" },
  { key: "status", label: "Status", required: false, hint: "Sold / Active / Pending" },
  { key: "sold_price", label: "Sold Price", required: false, hint: "Close / Sale price" },
  { key: "list_price", label: "List Price", required: false, hint: "Original asking price" },
  { key: "list_date", label: "List Date", required: false, hint: "When the listing went live" },
  { key: "closed_date", label: "Closed Date", required: false, hint: "When the sale closed" },
  { key: "days_on_market", label: "Days on Market", required: false, hint: "DOM / CDOM" },
  { key: "property_type", label: "Property Type", required: false, hint: "Single-family / Condo / Land" },
  { key: "city", label: "City", required: false, hint: "Optional — for non-ZIP segmentation" },
];

export function MlsColumnConfirmModal({
  open,
  preview,
  onCancel,
  onConfirm,
  committing,
  batchPosition,
  batchTotal,
}: {
  open: boolean;
  preview: PreviewResponse | null;
  onCancel: () => void;
  onConfirm: (overrides: Partial<Record<CanonicalField, string>>) => void;
  committing: boolean;
  /** 1-based current file in a multi-file batch. Undefined for single-file uploads. */
  batchPosition?: number;
  /** Total file count in this batch. Undefined for single-file uploads. */
  batchTotal?: number;
}) {
  const [overrides, setOverrides] = useState<
    Partial<Record<CanonicalField, string>>
  >({});

  // Reset whenever a new preview comes in so the modal doesn't carry
  // stale overrides from a previous upload.
  useEffect(() => {
    if (preview) setOverrides({});
  }, [preview]);

  if (!open || !preview) return null;

  const effectiveMapping: Partial<Record<CanonicalField, string>> = {
    ...preview.detected,
    ...overrides,
  };
  const zipOk = !!effectiveMapping.zip;

  // Sample rows pivoted by canonical field — easier to scan when
  // confirming "yes, that ZIP column actually contains ZIPs."
  const renderSampleCell = (canonical: CanonicalField, rowIdx: number) => {
    const col = effectiveMapping[canonical];
    if (!col) return <span className="text-muted-foreground/50">—</span>;
    const val = preview.sample_rows[rowIdx]?.[col] ?? "";
    return <span className="truncate">{val.slice(0, 60)}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-8 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">Confirm column mapping</h2>
              {batchTotal && batchPosition && batchTotal > 1 && (
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  File {batchPosition} of {batchTotal}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {preview.filename} · {preview.row_count.toLocaleString()} rows ·{" "}
              {preview.columns.length} columns
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable if tall */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground leading-relaxed">
            We auto-detected each canonical field below. Override any column
            that looks wrong — the dropdown lists every column in your file.
            ZIP is required; the others are best-effort.
          </p>

          {/* Mapping rows */}
          <div className="rounded-md border border-border divide-y divide-border">
            {FIELD_META.map(({ key, label, required, hint }) => {
              const detectedCol = preview.detected[key];
              const currentCol = effectiveMapping[key];
              const isOverridden =
                overrides[key] !== undefined && overrides[key] !== detectedCol;
              return (
                <div
                  key={key}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start px-3 py-2.5 text-xs"
                >
                  <div className="sm:col-span-4">
                    <p className="font-medium text-foreground/90">
                      {label}
                      {required && (
                        <span className="text-rose-500 ml-0.5">*</span>
                      )}
                    </p>
                    <p className="text-muted-foreground/80 text-[11px] mt-0.5">
                      {hint}
                    </p>
                  </div>
                  <div className="sm:col-span-5">
                    <Select
                      value={currentCol ?? "__none__"}
                      onValueChange={(v) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [key]: v === "__none__" ? undefined : v,
                        }))
                      }
                    >
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="(not mapped)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">(not mapped)</span>
                        </SelectItem>
                        {preview.columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-3 text-[11px] flex items-center gap-1">
                    {currentCol ? (
                      isOverridden ? (
                        <span className="text-amber-500">Override</span>
                      ) : (
                        <span className="text-emerald-500 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Auto-detected
                        </span>
                      )
                    ) : required ? (
                      <span className="text-rose-500 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Required
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">Skipped</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sample-row preview */}
          {preview.sample_rows.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sample rows (first {preview.sample_rows.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-background/40">
                      {FIELD_META.filter((f) => effectiveMapping[f.key]).map(
                        (f) => (
                          <th
                            key={f.key}
                            className="text-left px-3 py-1.5 font-medium text-muted-foreground"
                          >
                            {f.label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_rows.map((_, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/60 last:border-0"
                      >
                        {FIELD_META.filter((f) => effectiveMapping[f.key]).map(
                          (f) => (
                            <td
                              key={f.key}
                              className="px-3 py-1.5 max-w-[160px]"
                            >
                              {renderSampleCell(f.key, idx)}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Match preview */}
          {zipOk && (
            <div className="rounded-md border border-border px-3 py-2.5 text-xs">
              <p className="font-medium text-foreground/90 mb-1.5">
                If you commit this upload:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  label="ZIPs in file"
                  value={preview.file_zips_count.toLocaleString()}
                />
                <Stat
                  label="Segments match"
                  value={preview.match_preview.matched.length.toLocaleString()}
                  accent="emerald"
                />
                <Stat
                  label="Skipped"
                  value={preview.match_preview.skipped.length.toLocaleString()}
                  accent="muted"
                />
              </div>
              {preview.match_preview.skipped.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Skipped:{" "}
                  {preview.match_preview.skipped
                    .map((s) => s.geo_label || s.geo_key)
                    .slice(0, 6)
                    .join(", ")}
                  {preview.match_preview.skipped.length > 6 &&
                    ` + ${preview.match_preview.skipped.length - 6} more`}
                  . You can fill these with a follow-up upload covering those
                  ZIPs.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-background/40">
          <span className="text-[11px] text-muted-foreground">
            {batchTotal && batchTotal > 1
              ? "Cancel stops the whole batch."
              : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={committing}>
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(overrides)}
              disabled={!zipOk || committing}
              className="gap-1.5"
            >
              {committing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Committing…
                </>
              ) : batchTotal && batchPosition && batchTotal > batchPosition ? (
                "Confirm & continue"
              ) : (
                "Confirm & upload"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "muted";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}
