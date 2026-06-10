"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Eye,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingOutputRow, ListingRow } from "@/types/listing-studio";

type Variant = "announcement" | "pricing";

const VARIANT_LABELS: Record<Variant, string> = {
  announcement: "Announcement",
  pricing: "With Pricing Context",
};

const VARIANT_DESCRIPTIONS: Record<Variant, string> = {
  announcement:
    "Clean Just-Listed reveal. Hero photo, key facts, and a CTA. Works for any listing.",
  pricing:
    'Same reveal plus a "Why this price" block pulled from the CMA. Requires a CMA on this listing.',
};

export function HtmlEmailTab({ listing }: { listing: ListingRow }) {
  const [variants, setVariants] = useState<ListingOutputRow[]>([]);
  const [cmaAvailable, setCmaAvailable] = useState(false);
  const [selected, setSelected] = useState<Variant>("announcement");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [draftHtml, setDraftHtml] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/html-email`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to load");
      } else {
        setVariants(data.variants ?? []);
        setCmaAvailable(!!data.cmaAvailable);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [listing.id]);

  useEffect(() => {
    load();
  }, [load]);

  const current = useMemo(
    () => variants.find((v) => v.variant === selected),
    [variants, selected],
  );

  useEffect(() => {
    setDraftHtml(current?.content ?? "");
  }, [current?.content, current?.id]);

  async function handleGenerate() {
    if (selected === "pricing" && !cmaAvailable) {
      setError(
        "Generate a CMA first to use the With-Pricing-Context variant.",
      );
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/html-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variant: selected }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed");
      } else {
        const next: ListingOutputRow = data.output;
        setVariants((prev) => {
          const without = prev.filter((v) => v.variant !== next.variant);
          return [...without, next];
        });
      }
    } catch {
      setError("Network error during generation");
    } finally {
      setGenerating(false);
    }
  }

  async function saveEdits() {
    if (!current) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/html-email`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variant: selected,
            content: draftHtml,
            status: current.status,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
      } else {
        const next: ListingOutputRow = data.output;
        setVariants((prev) => {
          const without = prev.filter((v) => v.variant !== next.variant);
          return [...without, next];
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!current) return;
    const nextStatus = current.status === "finalized" ? "draft" : "finalized";
    const res = await fetch(
      `/api/apps/listing-studio/listings/${listing.id}/html-email`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: selected,
          content: draftHtml || current.content || "",
          status: nextStatus,
        }),
      },
    );
    const data = await res.json();
    if (res.ok) {
      const next: ListingOutputRow = data.output;
      setVariants((prev) => {
        const without = prev.filter((v) => v.variant !== next.variant);
        return [...without, next];
      });
    }
  }

  async function copyHtml() {
    if (!current?.content) return;
    await navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Just-Listed HTML email
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Branded HTML email built in your colors and fonts. Paste into
            your ESP&apos;s code editor — we don&apos;t host the photos, so
            edit the hero <code>img src</code> with your hosted URL before
            sending.
          </p>
        </div>
      </div>

      {/* Variant picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["announcement", "pricing"] as const).map((vKey) => {
          const isLocked = vKey === "pricing" && !cmaAvailable;
          const isSelected = selected === vKey;
          return (
            <button
              key={vKey}
              type="button"
              disabled={isLocked}
              onClick={() => setSelected(vKey)}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors",
                isSelected
                  ? "border-[#D4A35C] bg-[#D4A35C]/5"
                  : "border-border hover:bg-muted/30",
                isLocked && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                  {isLocked && <Lock className="h-3 w-3" />}
                  {VARIANT_LABELS[vKey]}
                </span>
                {isSelected && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#D4A35C]/10 text-[#D4A35C] font-medium">
                    Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {VARIANT_DESCRIPTIONS[vKey]}
              </p>
              {isLocked && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                  Run a CMA from the CMA tab to unlock.
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : current ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {current ? "Regenerate" : "Generate"}
          </button>
          {current?.content && (
            <button
              type="button"
              onClick={copyHtml}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-600" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy HTML
                </>
              )}
            </button>
          )}
        </div>
        {current?.content && (
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium",
                view === "preview"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
            <button
              type="button"
              onClick={() => setView("code")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border",
                view === "code"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Code2 className="h-3 w-3" /> Code
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {current?.pipeline_error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-destructive">
            <p className="font-medium">Generation failed</p>
            <p>{current.pipeline_error}</p>
          </div>
        </div>
      )}

      {current?.compliance_warning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {current.compliance_warning}
          </p>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-border bg-card/30 p-10 text-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : !current ? (
        <EmptyState />
      ) : view === "preview" ? (
        <PreviewFrame html={current.content ?? ""} />
      ) : (
        <div className="space-y-3">
          <textarea
            value={draftHtml}
            onChange={(e) => setDraftHtml(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-[#D4A35C]/30"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              Edits run through the same compliance check on save.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleStatus}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  current.status === "finalized"
                    ? "border border-border text-muted-foreground hover:bg-muted/50"
                    : "border border-border hover:bg-muted/50",
                )}
              >
                {current.status === "finalized"
                  ? "Mark as draft"
                  : "Mark as finalized"}
              </button>
              <button
                type="button"
                onClick={saveEdits}
                disabled={saving || draftHtml === current.content}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#D4A35C] text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save edits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewFrame({ html }: { html: string }) {
  if (!html) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/30 p-10 text-center text-xs text-muted-foreground">
        No preview yet.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden">
      <iframe
        title="HTML email preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full h-[640px] bg-white"
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <Sparkles className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">No HTML email yet</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Pick a variant above and click <b>Generate</b>.
      </p>
    </div>
  );
}
