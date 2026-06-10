"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ListingOutputRow, ListingRow } from "@/types/listing-studio";

const MLS_CHAR_LIMIT = 1000;

interface DescriptionTabProps {
  listing: ListingRow;
}

export function DescriptionTab({ listing }: DescriptionTabProps) {
  const [output, setOutput] = useState<ListingOutputRow | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Client-only dismissal of the compliance banner — the server still
  // stores the warning. This honors the "I've reviewed this" override
  // without claiming the underlying issue is fixed.
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const url = useMemo(
    () => `/api/apps/listing-studio/listings/${listing.id}/description`,
    [listing.id],
  );

  // Load existing description on mount (poll-once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { output: ListingOutputRow | null };
        if (cancelled) return;
        if (data.output) {
          setOutput(data.output);
          setDraft(data.output.content ?? "");
        }
      } catch {
        // Soft-fail; UI lets the user retry by generating.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setDismissedWarning(false);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // The route persists pipeline_error onto the row even on failure
        // so the UI can show the retry banner. Pick up either if present.
        if (data.output) {
          setOutput(data.output as ListingOutputRow);
          setDraft((data.output as ListingOutputRow).content ?? "");
        }
        setError(data.error ?? "Generation failed");
        return;
      }
      setOutput(data.output as ListingOutputRow);
      setDraft((data.output as ListingOutputRow).content ?? "");
    } catch {
      setError("Network error — try again.");
    } finally {
      setGenerating(false);
    }
  }, [url]);

  const handleSave = useCallback(async () => {
    if (draft === (output?.content ?? "")) return;
    setSaving(true);
    setError(null);
    setDismissedWarning(false);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setOutput(data.output as ListingOutputRow);
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }, [draft, output, url]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard API can be blocked in some browsers
    }
  }, [draft]);

  const charCount = draft.length;
  const overLimit = charCount > MLS_CHAR_LIMIT;
  const isDirty = output != null && draft !== (output.content ?? "");
  const pipelineError = output?.pipeline_error ?? null;
  const complianceWarning = output?.compliance_warning ?? null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-10 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state — never generated.
  if (!output) {
    return (
      <div className="space-y-4">
        <Intro />
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
          <Sparkles className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium text-foreground">
            No description yet
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Generate a Public Remarks draft from this listing&apos;s property
            facts. You&apos;ll be able to hand-edit before pasting into your MLS.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate description
          </button>
          {error && (
            <p className="mt-3 text-xs text-destructive">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Intro />

      {pipelineError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-destructive">
                Generation failed
              </p>
              <p className="mt-0.5 text-xs text-destructive/80">
                {pipelineError}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {complianceWarning && !dismissedWarning && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
                Compliance review flagged this draft
              </p>
              <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-500/80 whitespace-pre-wrap">
                {complianceWarning}
              </p>
              <p className="mt-1.5 text-[11px] text-amber-700/70 dark:text-amber-500/70">
                Listing agents are responsible for the final published copy.
                Edit the draft to remove the flagged language, then save — or
                acknowledge below if you&apos;re intentionally keeping it.
              </p>
              <button
                type="button"
                onClick={() => setDismissedWarning(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-amber-500/40 text-amber-700 dark:text-amber-500 hover:bg-amber-500/10"
              >
                I&apos;ve reviewed this
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground">
            MLS Public Remarks
          </p>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[11px] tabular-nums",
                overLimit ? "text-destructive font-medium" : "text-muted-foreground",
              )}
              title={`${MLS_CHAR_LIMIT}-char MLS Public Remarks ceiling`}
            >
              {charCount}/{MLS_CHAR_LIMIT}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <ClipboardCopy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          className="block w-full resize-y bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-sans leading-relaxed"
          placeholder="Hand-edit your description here…"
          spellCheck
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || saving}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Regenerate
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving || generating}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-md text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background:
              "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {isDirty ? "Save edits" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Public Remarks copy ready to paste into your MLS. Generated with
        Fair Housing + MLS-rule guardrails baked in, then reviewed by a
        second-pass compliance check.
      </p>
    </div>
  );
}
