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
import { RunBackButton } from "@/components/hyperlocal/runs/RunBackButton";
import {
  RunContextHeader,
  type RunContext,
} from "@/components/hyperlocal/runs/RunContextHeader";
import { DiscoverProgress } from "@/components/hyperlocal/runs/DiscoverProgress";
import { GenerateProgress } from "@/components/hyperlocal/runs/GenerateProgress";
import { RunCompleteSummary } from "@/components/hyperlocal/runs/RunCompleteSummary";
import { SendProgress } from "@/components/hyperlocal/runs/SendProgress";
import { AudienceConfirmBanner } from "@/components/hyperlocal/run/AudienceConfirmBanner";
import { HyperlocalMap } from "@/components/hyperlocal/map/HyperlocalMap";
import { RUN_PHASE_LABELS } from "@/types/hyperlocal";
import type { HlRun, HlSegment, HlEmail, RunPhase } from "@/types/hyperlocal";

const POLL_PHASES: RunPhase[] = ["discover", "generate", "sending"];

// Phases whose panel is compact enough to render alongside the map
// on wide screens. Rich phases (awaiting_mls, review) take full width.
const COMPACT_PHASES = new Set<RunPhase>(["discover", "generate"]);
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

  // Shared map node — rendered alongside compact phases via
  // <PhaseWithMap> on wide screens, or full-width below the phase
  // panel for rich phases. Defined once to avoid the prop drift
  // that comes from inlining the same JSX in 3 places.
  const mapPanel =
    segments.length > 0 ? (
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
    ) : null;

  // max-w-screen-2xl (1536px) gives the review phase real horizontal
  // room for the 3-column draft layout while staying centered on
  // ultra-wide monitors. Earlier max-w-4xl (896px) squeezed the
  // email preview to ~370px — unreadable.
  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {dialog}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            {(run as unknown as { campaign?: { name?: string } }).campaign
              ?.name ?? "Untitled Run"}
          </h1>
          <PhaseChip phase={run.phase} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Started {formatRelativeTime(run.created_at)}
          {displayedContactCount > 0 &&
            ` · ${displayedContactCount.toLocaleString()} ${contactCountLabel}`}
          {run.segments_count > 0 && ` · ${run.segments_count} segments`}
        </p>
      </div>

      <RunPhaseStepper phase={run.phase} />

      <RunContextHeader
        context={
          {
            campaign: (run as unknown as { campaign?: RunContext["campaign"] })
              .campaign,
            contactsCount: displayedContactCount,
            contactsLabel: contactCountLabel,
          } satisfies RunContext
        }
      />

      {run.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">Pipeline error</p>
            <p className="text-sm text-destructive/80 mt-1">{run.error}</p>
          </div>
          {run.phase === "failed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await fetch(
                  `/api/apps/hyperlocal/runs/${runId}/retry`,
                  { method: "POST" },
                );
                const json = await res.json();
                if (!res.ok) {
                  toast.error(json.error ?? "Retry failed");
                  return;
                }
                toast.success(`Resumed at ${json.phase}`);
                await fetchData();
              }}
              className="shrink-0"
            >
              Retry from last checkpoint
            </Button>
          )}
        </div>
      )}

      {/* Phase-specific panels.
          Compact phases (discover/generate/sending/completed) sit
          side-by-side with the map on wide screens to keep
          everything visible without scrolling. Rich phases
          (awaiting_mls, review) take full width — they have their
          own internal multi-column structure that wouldn't fit
          alongside a map. */}
      {run.phase === "discover" && (
        <PhaseWithMap mapPanel={mapPanel}>
          <DiscoverProgress run={run} />
        </PhaseWithMap>
      )}

      {run.phase === "awaiting_service_area" && (
        <ServiceAreaPicker runId={runId} onContinue={fetchData} />
      )}

      {run.phase === "awaiting_mls" && (
        <div className="space-y-3">
          <RunBackButton runId={runId} phase={run.phase} onMoved={fetchData} />
          <MlsUploadPanel
            runId={runId}
            segments={segments}
            onUploadComplete={fetchData}
            onAllReady={fetchData}
          />
        </div>
      )}

      {run.phase === "generate" && (
        <div className="space-y-3">
          <RunBackButton runId={runId} phase={run.phase} onMoved={fetchData} />
          <PhaseWithMap mapPanel={mapPanel}>
            <GenerateProgress
              segments={segments}
              emailsCount={data.emails.length}
            />
          </PhaseWithMap>
        </div>
      )}

      {run.phase === "review" && (
        <div className="space-y-3">
          <RunBackButton runId={runId} phase={run.phase} onMoved={fetchData} />
          <EmailDraftReview runId={runId} onApproved={fetchData} />
        </div>
      )}

      {run.phase === "awaiting_audience_confirmation" && (
        <AudienceConfirmBanner runId={runId} onResolved={fetchData} />
      )}

      {run.phase === "completed" && recipientCounts && (
        <RunCompleteSummary
          run={run}
          counts={recipientCounts}
          campaignId={
            (run as unknown as { campaign?: { id?: string } }).campaign?.id ??
            null
          }
          campaignName={
            (run as unknown as { campaign?: { name?: string } }).campaign?.name
          }
          segmentsCount={segments.length}
        />
      )}

      {(run.phase === "sending" || run.phase === "completed") &&
        recipientCounts && (
          <SendProgress run={run} counts={recipientCounts} />
        )}

      {/* Map of active segments — rendered standalone for phases
          where the compact phase-panel doesn't pair with it
          (awaiting_mls, review, awaiting_audience_confirmation, sending).
          Compact phases (discover, generate, completed) embed the map
          inside the phase block via <PhaseWithMap> instead.
          Picker phase has its own embedded map so we skip both ways. */}
      {segments.length > 0 &&
        !COMPACT_PHASES.has(run.phase) &&
        run.phase !== "awaiting_service_area" &&
        mapPanel}

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

// Wraps a compact phase panel beside the map on wide screens
// (lg:grid-cols-5 with a 2:3 ratio — the panel doesn't need 50% of
// the width). Stacks on narrow screens for mobile / split-pane use.
function PhaseWithMap({
  children,
  mapPanel,
}: {
  children: React.ReactNode;
  mapPanel: React.ReactNode;
}) {
  if (!mapPanel) return <>{children}</>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2">{children}</div>
      <div className="lg:col-span-3">{mapPanel}</div>
    </div>
  );
}

// Phase-coded badge sized to sit beside the H1. Pulls its label from
// RUN_PHASE_LABELS so any future phase rename ripples through.
function PhaseChip({ phase }: { phase: RunPhase }) {
  const style: Record<
    string,
    { bg: string; text: string; border: string; pulse?: boolean }
  > = {
    discover: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
      pulse: true,
    },
    awaiting_service_area: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
    },
    awaiting_mls: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
    },
    awaiting_audience_confirmation: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
    },
    generate: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
      pulse: true,
    },
    review: {
      bg: "bg-primary/15",
      text: "text-primary",
      border: "border-primary/30",
    },
    sending: {
      bg: "bg-sky-500/10",
      text: "text-sky-500",
      border: "border-sky-500/30",
      pulse: true,
    },
    completed: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-500",
      border: "border-emerald-500/30",
    },
    failed: {
      bg: "bg-destructive/10",
      text: "text-destructive",
      border: "border-destructive/30",
    },
    cancelled: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
    },
  };
  const s = style[phase] ?? style.discover;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${s.bg} ${s.text} ${s.border}`}
    >
      {s.pulse && (
        <span className={`w-1.5 h-1.5 rounded-full ${s.text.replace("text-", "bg-")} animate-pulse`} />
      )}
      {RUN_PHASE_LABELS[phase]}
    </span>
  );
}

// Compact "2 hours ago" formatting. Falls back to absolute date for
// runs older than ~7 days where relative loses meaning.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (sec < 86_400) {
    const h = Math.floor(sec / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (sec < 604_800) {
    const d = Math.floor(sec / 86_400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString();
}
