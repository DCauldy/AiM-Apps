"use client";

import { useState } from "react";
import { Eye, Loader2, RefreshCw, AlertCircle } from "lucide-react";

import { LandingPage } from "@/app/cma/[token]/landing-page";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import type { CmaClient } from "@/types/cma";
import type { PlatformProfile } from "@/types/platform-profile";

interface PreviewRun {
  id: string;
  comps: unknown;
  adjustment_grid: unknown;
  appraised_value_cents: number | null;
  marketable_value_cents: number | null;
  recommended_price_cents: number | null;
  seller_narrative_md: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

interface PreviewPayload {
  client: CmaClient;
  run: PreviewRun | null;
  agent: PlatformProfile | null;
  prior: {
    recommended_price_cents: number | null;
    estimated_value_cents: number | null;
    delivered_at: string | null;
  } | null;
}

/**
 * Inline CMA preview — renders the same LandingPage component the
 * past client sees, fed by a one-off pipeline run for this client's
 * address. The agent gets the rich Mapbox hero + comp cards +
 * narrative without having to wait for a real delivery to fire.
 *
 * First load can take ~30-90s (RapidAPI + 2x Claude) — subsequent
 * loads reuse the most recent ls_cma_runs row for this client.
 * Agents can force a re-run via "Regenerate".
 */
export function CmaPreviewPanel({ client }: { client: CmaClient }) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/clients/${client.id}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? `HTTP ${res.status}`;
        setError(msg);
        addToast({
          title: "Preview failed",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      setPreview(data as PreviewPayload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      addToast({
        title: "Preview failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: "Regenerate this preview?",
      description:
        "Forces a fresh pipeline run — uses one MLS lookup. Skip if the existing preview is recent enough.",
      confirmLabel: "Regenerate",
    });
    if (ok) await generate(true);
  };

  // ---- Pre-preview CTA state ----
  if (!preview && !loading && !error) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-[#D4A35C]" />
              CMA preview
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              See exactly what {client.first_name || "this client"} will see
              when the next CMA fires — Mapbox hero, comp cards, narrative,
              the works. First preview pulls property data + comps (~30-90s);
              subsequent previews reuse the most recent run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => generate(false)}
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview the CMA
          </button>
        </div>
      </div>
    );
  }

  // ---- Loading state — skeleton-ish placeholder ----
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#D4A35C]" />
        <p className="text-sm font-medium">Generating CMA preview…</p>
        <p className="mt-1 text-xs text-muted-foreground">
          First run pulls property data + comps + narrative — can take up to
          90 seconds. Subsequent previews are instant.
        </p>
      </div>
    );
  }

  // ---- Error state ----
  if (error && !preview) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-rose-300">
              Preview failed
            </h3>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={() => generate(false)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent flex-shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!preview) return null;

  // ---- Loaded preview ----
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-[#D4A35C]" />
          CMA preview
        </h3>
        <button
          type="button"
          onClick={handleRegenerate}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
      </div>
      {/* Embed the same landing-page component the past client sees.
          previewMode adds the amber banner; the LandingPage's own
          min-h-screen + dark theme are visually distinct from the
          admin chrome by design. */}
      <div className="border-t border-border">
        <LandingPage
          client={preview.client}
          run={preview.run}
          agent={preview.agent}
          prior={preview.prior}
          previewMode
        />
      </div>
    </div>
  );
}
