"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { RunPhaseStepper } from "@/components/hyperlocal/runs/RunPhaseStepper";
import { SegmentList } from "@/components/hyperlocal/runs/SegmentList";
import { ServiceAreaPicker } from "@/components/hyperlocal/runs/ServiceAreaPicker";
import { MlsUploadPanel } from "@/components/hyperlocal/runs/MlsUploadPanel";
import { EmailDraftReview } from "@/components/hyperlocal/runs/EmailDraftReview";
import { SendProgress } from "@/components/hyperlocal/runs/SendProgress";
import { HyperlocalMap } from "@/components/hyperlocal/map/HyperlocalMap";
import { RUN_PHASE_LABELS } from "@/types/hyperlocal";
import type { HlRun, HlSegment, HlEmail, RunPhase } from "@/types/hyperlocal";

const POLL_PHASES: RunPhase[] = ["discover", "generate", "sending"];
// awaiting_service_area / awaiting_mls don't poll — they're driven by user
// action (selection / upload) which already calls fetchData on success.

interface RunPayload {
  run: HlRun;
  segments: HlSegment[];
  emails: HlEmail[];
}

export function RunClient({
  runId,
  initialRun,
}: {
  runId: string;
  initialRun: HlRun;
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [data, setData] = useState<RunPayload>({
    run: initialRun,
    segments: [],
    emails: [],
  });
  const [recipientCounts, setRecipientCounts] = useState<{
    pending: number;
    sent: number;
    suppressed: number;
    bounced: number;
    complained: number;
    failed: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/hyperlocal/runs/${runId}`);
      if (!res.ok) throw new Error("Failed to load run");
      const json = (await res.json()) as RunPayload;
      setData(json);

      // Fetch recipient summary when sending/completed
      if (
        json.run.phase === "sending" ||
        json.run.phase === "completed"
      ) {
        const r = await fetch(
          `/api/apps/hyperlocal/runs/${runId}/recipients-summary`
        );
        if (r.ok) {
          const rj = await r.json();
          setRecipientCounts(rj.counts);
        }
      }
    } catch {
      // Silently fail; next poll will retry
    }
  }, [runId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!POLL_PHASES.includes(data.run.phase)) return;
    const id = setInterval(() => void fetchData(), 3000);
    return () => clearInterval(id);
  }, [data.run.phase, fetchData]);

  const cancel = async () => {
    const ok = await confirm({
      title: "Cancel this run?",
      message:
        "Queued sends will stop. Already-sent emails can't be recalled. The run can't be resumed.",
      confirmLabel: "Cancel run",
      cancelLabel: "Keep going",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/runs/${runId}/cancel`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Cancel failed");
      return;
    }
    toast.success("Run cancelled");
    await fetchData();
  };

  const { run, segments } = data;
  const canCancel = !["completed", "failed", "cancelled"].includes(run.phase);

  // Contact count for the header: during discover + service-area picker, the
  // 'all from CRM' count is meaningful (you haven't narrowed yet). After
  // that, show only contacts in active (non-skipped) segments so the number
  // matches what we're actually about to email.
  const earlyPhases: RunPhase[] = ["discover", "awaiting_service_area"];
  const activeContactCount = segments.reduce(
    (sum, s) => sum + (s.contact_count ?? 0),
    0
  );
  const displayedContactCount = earlyPhases.includes(run.phase)
    ? run.contacts_fetched
    : activeContactCount;
  const contactCountLabel = earlyPhases.includes(run.phase)
    ? "contacts"
    : "in-area contacts";

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      {dialog}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          Run
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Started {new Date(run.created_at).toLocaleString()}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {RUN_PHASE_LABELS[run.phase]}
          {displayedContactCount > 0 &&
            ` · ${displayedContactCount.toLocaleString()} ${contactCountLabel}`}
          {run.segments_count > 0 && ` · ${run.segments_count} segments`}
        </p>
      </div>

      <RunPhaseStepper phase={run.phase} />

      {run.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">Pipeline error</p>
          <p className="text-sm text-destructive/80 mt-1">{run.error}</p>
        </div>
      )}

      {/* Phase-specific panels */}
      {run.phase === "discover" && (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium">Pulling contacts from your CRM…</p>
          <p className="text-xs text-muted-foreground mt-1">
            This usually takes 10–60 seconds depending on contact count.
          </p>
        </div>
      )}

      {run.phase === "awaiting_service_area" && (
        <ServiceAreaPicker runId={runId} onContinue={fetchData} />
      )}

      {run.phase === "awaiting_mls" && (
        <MlsUploadPanel
          runId={runId}
          segments={segments}
          onUploadComplete={fetchData}
          onAllReady={fetchData}
        />
      )}

      {run.phase === "generate" && (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium">Writing drafts…</p>
          <p className="text-xs text-muted-foreground mt-1">
            Claude is composing per-segment market reports. Usually 1–3 minutes.
          </p>
        </div>
      )}

      {run.phase === "review" && (
        <EmailDraftReview runId={runId} onApproved={fetchData} />
      )}

      {(run.phase === "sending" || run.phase === "completed") &&
        recipientCounts && (
          <SendProgress run={run} counts={recipientCounts} />
        )}

      {/* Map of active segments — hidden during the picker phase (the
          ServiceAreaPicker has its own embedded map) */}
      {segments.length > 0 && run.phase !== "awaiting_service_area" && (
        <HyperlocalMap
          segments={segments.map((s) => ({
            zip: s.geo_key,
            geo_label: s.geo_label,
            contact_count: s.contact_count,
            below_min_size: s.below_min_size,
          }))}
          selectedZips={new Set(segments.map((s) => s.geo_key))}
          height={460}
          overlayChip={`${segments.length} ZIP${segments.length === 1 ? "" : "s"} · ${activeContactCount.toLocaleString()} contacts`}
        />
      )}

      {/* Segment list */}
      {segments.length > 0 && <SegmentList segments={segments} />}

      {canCancel && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={cancel}>
            Cancel run
          </Button>
        </div>
      )}
    </div>
  );
}
