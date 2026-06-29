"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { HlEmail } from "@/types/hyperlocal";

// ============================================================
// Inline draft editor — review + edit an email right on the Magic
// "drafts are ready" screen, no navigation. Expands to show the live
// rendered preview, an editable subject/preheader, and an AI-refine
// box. Reuses the existing email endpoints (PATCH + chat), so it stays
// in sync with the full editor.
// ============================================================

export function InlineDraftEditor({
  runId,
  email,
  open,
  onToggle,
  onUpdated,
}: {
  runId: string;
  email: HlEmail & { recipient_count?: number };
  open: boolean;
  onToggle: () => void;
  onUpdated: (email: HlEmail) => void;
}) {
  const [subject, setSubject] = useState(email.subject ?? "");
  const [preheader, setPreheader] = useState(email.preheader ?? "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [refine, setRefine] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refinementsLeft =
    (email.refinements_limit ?? 0) - (email.refinements_used ?? 0);
  const metaDirty =
    subject !== (email.subject ?? "") || preheader !== (email.preheader ?? "");

  const base = `/api/apps/hyperlocal/runs/${runId}/emails/${email.id}`;

  const refetch = async () => {
    const res = await fetch(base);
    if (res.ok) {
      const { email: fresh } = await res.json();
      if (fresh) {
        onUpdated(fresh);
        setSubject(fresh.subject ?? "");
        setPreheader(fresh.preheader ?? "");
      }
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, preheader }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't save.");
      } else if (json.email) {
        onUpdated(json.email);
      }
    } catch {
      setError("Couldn't save.");
    } finally {
      setSavingMeta(false);
    }
  };

  const sendRefine = async () => {
    const message = refine.trim();
    if (!message || refining) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch(`${base}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.code === "pack_limit_reached"
            ? "You're out of AI edits for this draft on your plan."
            : json.error ?? "Couldn't apply that edit.",
        );
      } else {
        setRefine("");
        await refetch();
      }
    } catch {
      setError("Couldn't apply that edit.");
    } finally {
      setRefining(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-colors",
        open ? "border-[#F43F5E]/40" : "border-border",
      )}
    >
      {/* Header — click to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {email.subject || "Untitled draft"}
          </p>
          {email.preheader && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {email.preheader}
            </p>
          )}
        </div>
        {email.status === "approved" && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-500">
            <Check className="h-3.5 w-3.5" /> approved
          </span>
        )}
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {/* Live preview */}
          <iframe
            title={`Preview of ${email.subject ?? "email"}`}
            srcDoc={email.html ?? ""}
            className="h-[420px] w-full rounded-md border border-border bg-white"
            sandbox="allow-same-origin"
          />

          {/* Subject + preheader */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Subject
              </span>
              <Input
                value={subject}
                maxLength={120}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Preheader
              </span>
              <Input
                value={preheader}
                maxLength={150}
                onChange={(e) => setPreheader(e.target.value)}
              />
            </label>
          </div>
          {metaDirty && (
            <Button size="sm" onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? "Saving…" : "Save subject & preheader"}
            </Button>
          )}

          {/* AI refine */}
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-[#F43F5E]" /> Refine with AI
              </span>
              <span className="text-[11px] text-muted-foreground">
                {refinementsLeft > 0
                  ? `${refinementsLeft} edit${refinementsLeft === 1 ? "" : "s"} left`
                  : "No AI edits left"}
              </span>
            </div>
            <Textarea
              value={refine}
              onChange={(e) => setRefine(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendRefine();
              }}
              placeholder="e.g. Make it warmer and mention the school district"
              rows={2}
              disabled={refinementsLeft <= 0 || refining}
              className="mt-2 resize-none text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={sendRefine}
                disabled={!refine.trim() || refining || refinementsLeft <= 0}
              >
                {refining ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Refining…
                  </>
                ) : (
                  "Apply edit"
                )}
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
