"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { HlEmail } from "@/types/hyperlocal";

// ============================================================
// Master-detail draft review for the Magic "drafts are ready" screen.
//   - DraftListItem: compact row for the list column.
//   - DraftEditorPane: the live preview + inline edits + AI-refine box,
//     shown for the selected draft (no extra navigation).
// Both reuse the existing email endpoints (PATCH + chat), so they stay
// in sync with the full editor.
// ============================================================

type DraftEmail = HlEmail & { recipient_count?: number };

export function DraftListItem({
  email,
  active,
  onClick,
}: {
  email: DraftEmail;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-[#F43F5E]/45 bg-[#F43F5E]/10"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {email.subject || "Untitled draft"}
        </p>
        {email.status === "approved" && (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
      </div>
      {email.preheader && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {email.preheader}
        </p>
      )}
    </button>
  );
}

export function DraftEditorPane({
  runId,
  email,
  onUpdated,
}: {
  runId: string;
  email: DraftEmail;
  onUpdated: (email: HlEmail) => void;
}) {
  const [subject, setSubject] = useState(email.subject ?? "");
  const [preheader, setPreheader] = useState(email.preheader ?? "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [refine, setRefine] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the editable fields when the selected draft changes.
  useEffect(() => {
    setSubject(email.subject ?? "");
    setPreheader(email.preheader ?? "");
    setRefine("");
    setError(null);
  }, [email.id, email.subject, email.preheader]);

  const refinementsLeft =
    (email.refinements_limit ?? 0) - (email.refinements_used ?? 0);
  const metaDirty =
    subject !== (email.subject ?? "") || preheader !== (email.preheader ?? "");

  const base = `/api/apps/hyperlocal/runs/${runId}/emails/${email.id}`;

  const refetch = async () => {
    const res = await fetch(base);
    if (res.ok) {
      const { email: fresh } = await res.json();
      if (fresh) onUpdated(fresh);
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
      if (!res.ok) setError(json.error ?? "Couldn't save.");
      else if (json.email) onUpdated(json.email);
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
    <div className="space-y-4">
      {/* Live preview */}
      <iframe
        title={`Preview of ${email.subject ?? "email"}`}
        srcDoc={email.html ?? ""}
        className="h-[460px] w-full rounded-md border border-border bg-white"
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
  );
}
