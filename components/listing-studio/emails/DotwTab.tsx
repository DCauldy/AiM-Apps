"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingRow } from "@/types/listing-studio";

interface DotwVariantPayload {
  variant: "a" | "b";
  subject: string;
  preheader: string;
  body: string;
  status: "draft" | "finalized";
  compliance_warning: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

const VARIANT_LABELS: Record<"a" | "b", string> = {
  a: "Variant A · Question-led",
  b: "Variant B · Three reasons",
};

export function DotwTab({ listing }: { listing: ListingRow }) {
  const [variants, setVariants] = useState<DotwVariantPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/dotw`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to load");
      } else {
        setVariants(data.variants ?? []);
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

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/dotw`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed");
      } else {
        setVariants(data.variants ?? []);
      }
    } catch {
      setError("Network error during generation");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(updated: DotwVariantPayload) {
    const res = await fetch(
      `/api/apps/listing-studio/listings/${listing.id}/dotw`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: updated.variant,
          subject: updated.subject,
          preheader: updated.preheader,
          body: updated.body,
          status: updated.status,
        }),
      },
    );
    const data = await res.json();
    if (res.ok && data?.variant) {
      setVariants((prev) =>
        prev.map((v) => (v.variant === updated.variant ? data.variant : v)),
      );
    } else {
      setError(data?.error ?? "Save failed");
    }
  }

  const hasContent = variants.some((v) => v.body && !v.pipeline_error);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Deal of the Week
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Plain-text personal note for your sphere. Pick the variant that
            fits the tone of the week — or send both A/B to different
            segments.
          </p>
        </div>
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
          ) : hasContent ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {hasContent ? "Regenerate both variants" : "Generate both variants"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-border bg-card/30 p-10 text-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : variants.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(["a", "b"] as const).map((vKey) => {
            const v = variants.find((x) => x.variant === vKey);
            if (!v) return null;
            return (
              <VariantCard
                key={vKey}
                variant={v}
                label={VARIANT_LABELS[vKey]}
                onSave={handleSave}
                onRetry={handleGenerate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <Sparkles className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">
        No DOTW emails yet
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Click <b>Generate both variants</b> to produce two takes on the
        weekly note — pick whichever fits the week.
      </p>
    </div>
  );
}

function VariantCard({
  variant,
  label,
  onSave,
  onRetry,
}: {
  variant: DotwVariantPayload;
  label: string;
  onSave: (v: DotwVariantPayload) => void | Promise<void>;
  onRetry: () => void;
}) {
  const [local, setLocal] = useState(variant);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLocal(variant);
  }, [variant]);

  async function commit(next: Partial<DotwVariantPayload>) {
    const merged = { ...local, ...next };
    setLocal(merged);
    setSaving(true);
    try {
      await onSave(merged);
    } finally {
      setSaving(false);
    }
  }

  async function copyAll() {
    const composed = [
      `Subject: ${local.subject}`,
      local.preheader ? `Preheader: ${local.preheader}` : "",
      "",
      local.body,
    ]
      .filter(Boolean)
      .join("\n");
    await navigator.clipboard.writeText(composed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (variant.pipeline_error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
        <p className="text-xs text-destructive">
          Generation failed: {variant.pipeline_error}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <div className="flex items-center gap-1.5">
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
              local.status === "finalized"
                ? "border-[#D4A35C]/50 text-[#D4A35C] bg-[#D4A35C]/10"
                : "border-border text-muted-foreground bg-muted/30",
            )}
          >
            {local.status === "finalized" ? "Finalized" : "Draft"}
          </span>
        </div>
      </div>

      {variant.compliance_warning && (
        <ComplianceBanner warning={variant.compliance_warning} />
      )}

      <Field label="Subject">
        <input
          type="text"
          value={local.subject}
          onChange={(e) => setLocal({ ...local, subject: e.target.value })}
          onBlur={() => commit({ subject: local.subject })}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-[#D4A35C]/30"
        />
      </Field>

      <Field label="Preheader">
        <input
          type="text"
          value={local.preheader}
          onChange={(e) => setLocal({ ...local, preheader: e.target.value })}
          onBlur={() => commit({ preheader: local.preheader })}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-[#D4A35C]/30"
        />
      </Field>

      <Field label="Body">
        <textarea
          value={local.body}
          onChange={(e) => setLocal({ ...local, body: e.target.value })}
          onBlur={() => commit({ body: local.body })}
          rows={10}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-[#D4A35C]/30"
        />
      </Field>

      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-600" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            commit({
              status: local.status === "finalized" ? "draft" : "finalized",
            })
          }
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            local.status === "finalized"
              ? "border border-border text-muted-foreground hover:bg-muted/50"
              : "bg-[#D4A35C] text-white hover:opacity-90",
          )}
        >
          {local.status === "finalized" ? "Mark as draft" : "Mark as finalized"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}

function ComplianceBanner({ warning }: { warning: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
      <p className="text-xs text-amber-900 dark:text-amber-200">{warning}</p>
    </div>
  );
}
