"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { SettingsCapacity } from "./types";

// Customer self-service: ask AiM to add a prompt or competitor to
// the tracked report. Until Otterly's partner API exposes write
// endpoints for these, ops fulfills manually from /admin/radar-requests.
//
// Capacity-aware: if the customer is at their tier cap, the form
// requires picking an existing prompt/competitor to drop in the same
// request. Submit disabled until that replace target is picked.

interface CustomizeSectionProps {
  capacity: SettingsCapacity | null;
  trackedPrompts: Array<{ id: string; prompt: string }>;
  competitors: Array<{ brand: string; domain: string }>;
}

interface RecentRequest {
  id: string;
  type: "add_prompt" | "add_competitor";
  payload: Record<string, unknown>;
  status: string;
  requested_at: string;
  completed_at: string | null;
}

export function CustomizeSection({
  capacity,
  trackedPrompts,
  competitors,
}: CustomizeSectionProps) {
  const { addToast } = useToast();
  const [openForm, setOpenForm] = useState<
    "add_prompt" | "add_competitor" | null
  >(null);
  const [promptText, setPromptText] = useState("");
  const [replacePromptId, setReplacePromptId] = useState("");
  const [competitorBrand, setCompetitorBrand] = useState("");
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [replaceCompetitorBrand, setReplaceCompetitorBrand] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const promptsAtCap =
    capacity != null && capacity.promptsUsed >= capacity.promptsCap;
  const competitorsAtCap =
    capacity != null && capacity.competitorsUsed >= capacity.competitorsCap;

  const [recent, setRecent] = useState<RecentRequest[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/apps/radar/requests", { cache: "no-store" });
      const data = await res.json();
      setRecent(data.requests ?? []);
    } catch {
      // Non-fatal — request history is supplementary.
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const submit = async () => {
    setSubmitting(true);
    try {
      let body: Record<string, unknown>;
      if (openForm === "add_prompt") {
        body = {
          type: "add_prompt",
          prompt: promptText.trim(),
          ...(replacePromptId
            ? {
                replace_prompt_id: replacePromptId,
                replace_prompt_text:
                  trackedPrompts.find((p) => p.id === replacePromptId)?.prompt,
              }
            : {}),
        };
      } else {
        body = {
          type: "add_competitor",
          brand: competitorBrand.trim(),
          domain: competitorDomain.trim() || undefined,
          ...(replaceCompetitorBrand
            ? { replace_competitor_brand: replaceCompetitorBrand }
            : {}),
        };
      }
      const res = await fetch("/api/apps/radar/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "created") {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      addToast({
        title: "Request submitted",
        description:
          openForm === "add_prompt"
            ? "We'll add the prompt to your tracking within 24-48 hours."
            : "We'll add the competitor within 24-48 hours.",
      });
      setOpenForm(null);
      setPromptText("");
      setReplacePromptId("");
      setCompetitorBrand("");
      setCompetitorDomain("");
      setReplaceCompetitorBrand("");
      loadRecent();
    } catch (e) {
      addToast({
        title: "Couldn't submit request",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Customize</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Ask AiM to add a prompt or competitor to your tracking. Most requests
          are fulfilled within 24-48 hours.
        </p>
      </header>

      <div className="p-5 space-y-3">
        {openForm === null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpenForm("add_prompt")}
              className="rounded-md border border-border bg-background px-4 py-3 text-left hover:border-[#e0a458]/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="h-3.5 w-3.5 text-sky-400" />
                Add a tracked prompt
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Track a specific query (e.g. &quot;best agents in Hyde
                Park&quot;).
              </p>
            </button>

            <button
              type="button"
              onClick={() => setOpenForm("add_competitor")}
              className="rounded-md border border-border bg-background px-4 py-3 text-left hover:border-[#e0a458]/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="h-3.5 w-3.5 text-violet-400" />
                Add a competitor
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Track another brand alongside the auto-picked competitor list.
              </p>
            </button>
          </div>
        )}

        {openForm === "add_prompt" && (
          <div className="space-y-3">
            {capacity && (
              <CapacityNote
                used={capacity.promptsUsed}
                cap={capacity.promptsCap}
                noun="prompt"
                atCap={promptsAtCap}
              />
            )}
            <div>
              <label className="text-xs font-medium text-foreground block">
                Prompt to track
              </label>
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="best real estate agents in Hyde Park"
                className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {trackedPrompts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-foreground block">
                  {promptsAtCap ? "Replace which prompt?" : "Replace a prompt (optional)"}
                </label>
                <select
                  value={replacePromptId}
                  onChange={(e) => setReplacePromptId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">
                    {promptsAtCap
                      ? "— Pick a prompt to drop —"
                      : "Just add as new (don't replace)"}
                  </option>
                  {trackedPrompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prompt.length > 70
                        ? p.prompt.slice(0, 67) + "…"
                        : p.prompt}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {promptsAtCap
                    ? "You're at your plan's prompt cap, so adding requires replacing one."
                    : "Optional — leave blank to add without removing anything."}
                </p>
              </div>
            )}
            <FormActions
              onCancel={() => setOpenForm(null)}
              onSubmit={submit}
              submitting={submitting}
              disabled={
                promptText.trim().length < 4 ||
                (promptsAtCap && !replacePromptId)
              }
            />
          </div>
        )}

        {openForm === "add_competitor" && (
          <div className="space-y-3">
            {capacity && (
              <CapacityNote
                used={capacity.competitorsUsed}
                cap={capacity.competitorsCap}
                noun="competitor"
                atCap={competitorsAtCap}
              />
            )}
            <div>
              <label className="text-xs font-medium text-foreground block">
                Brand name
              </label>
              <input
                type="text"
                value={competitorBrand}
                onChange={(e) => setCompetitorBrand(e.target.value)}
                placeholder="Coldwell Banker West Shell"
                className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block">
                Domain (optional)
              </label>
              <input
                type="text"
                value={competitorDomain}
                onChange={(e) => setCompetitorDomain(e.target.value)}
                placeholder="cbws.com"
                className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {competitors.length > 0 && (
              <div>
                <label className="text-xs font-medium text-foreground block">
                  {competitorsAtCap
                    ? "Replace which competitor?"
                    : "Replace a competitor (optional)"}
                </label>
                <select
                  value={replaceCompetitorBrand}
                  onChange={(e) => setReplaceCompetitorBrand(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">
                    {competitorsAtCap
                      ? "— Pick a competitor to drop —"
                      : "Just add as new (don't replace)"}
                  </option>
                  {competitors.map((c) => (
                    <option key={c.brand} value={c.brand}>
                      {c.brand}
                      {c.domain ? ` (${c.domain})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {competitorsAtCap
                    ? "You're at your plan's competitor cap, so adding requires replacing one."
                    : "Optional — leave blank to add without removing anything."}
                </p>
              </div>
            )}
            <FormActions
              onCancel={() => setOpenForm(null)}
              onSubmit={submit}
              submitting={submitting}
              disabled={
                competitorBrand.trim().length === 0 ||
                (competitorsAtCap && !replaceCompetitorBrand)
              }
            />
          </div>
        )}

        {!loadingRecent && recent.length > 0 && <RecentList recent={recent} />}
      </div>
    </section>
  );
}

function CapacityNote({
  used,
  cap,
  noun,
  atCap,
}: {
  used: number;
  cap: number;
  noun: "prompt" | "competitor";
  atCap: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs flex items-center justify-between gap-2",
        atCap
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <span>
        Tracking{" "}
        <strong className="tabular-nums">
          {used} of {cap}
        </strong>{" "}
        {noun}
        {used === 1 && noun === "prompt" ? "" : noun === "prompt" ? "s" : "s"}.
        {atCap && " You're at your plan's cap."}
      </span>
      {atCap && (
        <a
          href="/apps/radar/settings?tab=upgrade"
          className="font-medium underline hover:no-underline shrink-0"
        >
          Upgrade
        </a>
      )}
    </div>
  );
}

function FormActions({
  onCancel,
  onSubmit,
  submitting,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || disabled}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit request"
        )}
      </button>
    </div>
  );
}

function RecentList({ recent }: { recent: RecentRequest[] }) {
  return (
    <div className="pt-3 mt-3 border-t border-border">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
        Your recent requests
      </div>
      <ul className="space-y-1.5">
        {recent.slice(0, 5).map((r) => {
          const detail =
            r.type === "add_prompt"
              ? `Prompt: "${String(r.payload.prompt ?? "")}"`
              : `Competitor: ${String(r.payload.brand ?? "")}`;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-foreground truncate">{detail}</span>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0",
                  r.status === "completed"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : r.status === "rejected"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {r.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
