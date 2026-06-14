"use client";

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import type { RunPhase } from "@/types/hyperlocal";

// ============================================================
// Inline back-navigation link. Renders only when the current run
// phase has a safe earlier phase to return to. Confirms with a
// modal when the move is destructive (drops segments or drafts) so
// the agent doesn't accidentally erase work.
//
// Safe transitions (the back endpoint enforces the same set):
//   awaiting_mls → awaiting_service_area  (destructive: drops segments)
//   generate     → awaiting_mls          (safe: no data loss)
//   review       → generate              (destructive: drops drafts)
//
// Phases not in the table render nothing — no back button shown for
// discover, sending, completed, failed, cancelled,
// awaiting_audience_confirmation.
// ============================================================

interface BackSpec {
  targetPhase: RunPhase;
  label: string;
  destructive: boolean;
  /** Modal copy if destructive. Empty when not destructive (no confirm). */
  warning?: { title: string; message: string };
}

const BACK_TABLE = new Map<RunPhase, BackSpec>([
  [
    "awaiting_mls",
    {
      targetPhase: "awaiting_service_area",
      label: "Re-pick service area",
      destructive: true,
      warning: {
        title: "Re-pick service area?",
        message:
          "Going back will drop the current segments. Any MLS upload metrics attached to them are lost (your profile's monthly snapshots stay). You'll re-pick ZIPs and re-upload MLS data.",
      },
    },
  ],
  [
    "generate",
    {
      targetPhase: "awaiting_mls",
      label: "Back to MLS upload",
      destructive: false,
    },
  ],
  [
    "review",
    {
      targetPhase: "generate",
      label: "Regenerate drafts",
      destructive: true,
      warning: {
        title: "Regenerate drafts?",
        message:
          "Going back will delete the current drafts and any AI edits you've made. Segments + MLS metrics stay — the drafts get regenerated from scratch when you continue.",
      },
    },
  ],
]);

export function RunBackButton({
  runId,
  phase,
  onMoved,
}: {
  runId: string;
  phase: RunPhase;
  onMoved: () => void;
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [busy, setBusy] = useState(false);
  const spec = BACK_TABLE.get(phase);
  if (!spec) return null;

  const handleClick = async () => {
    if (spec.destructive && spec.warning) {
      const ok = await confirm({
        title: spec.warning.title,
        message: spec.warning.message,
        confirmLabel: spec.label,
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/apps/hyperlocal/runs/${runId}/back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_phase: spec.targetPhase }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Back navigation failed");
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Back navigation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {dialog}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowLeft className="h-3.5 w-3.5" />
        )}
        {spec.label}
      </button>
    </>
  );
}
