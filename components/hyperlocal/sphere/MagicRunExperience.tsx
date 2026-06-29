"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CampaignBuildProgress,
  type BuildPhase,
} from "@/components/hyperlocal/sphere/CampaignBuildProgress";
import {
  DraftListItem,
  DraftEditorPane,
} from "@/components/hyperlocal/sphere/InlineDraftEditor";
import { cn } from "@/lib/utils";
import type { HlRun, HlSegment, HlEmail, RunPhase } from "@/types/hyperlocal";

// ============================================================
// MagicRunExperience — the "✨ Send it" payoff. After a Magic launch
// the run flows discover → generate → review → sending with no manual
// gates (service area is pre-set, depth is "quick" so no MLS). This
// gives that flow a single, delightful surface: watch the drafts get
// written, then one button — "Approve & send all". The heavy
// per-segment EmailDraftReview is untouched and still powers Control
// mode via the classic run-client.
// ============================================================

interface RunPayload {
  run: HlRun;
  segments: HlSegment[];
  emails: HlEmail[];
}

const WORKING_PHASES = new Set<RunPhase>([
  "discover",
  "generate",
  "awaiting_audience_confirmation",
]);
// Phases that need the full editor (shouldn't happen for a Magic run, but if
// it does we bounce to the classic view rather than dead-end).
const NEEDS_FULL_EDITOR = new Set<RunPhase>([
  "awaiting_service_area",
  "awaiting_mls",
]);
const POLL_PHASES = new Set<RunPhase>([
  "discover",
  "generate",
  "sending",
  "awaiting_audience_confirmation",
]);

// The campaign-building pipeline, surfaced as live steps (Tours-style).
const BUILD_PHASES: BuildPhase[] = [
  {
    key: "reading",
    label: "Reading your sphere",
    detail: "Pulling your contacts from the CRM",
  },
  {
    key: "mapping",
    label: "Mapping neighborhoods",
    detail: "Grouping your contacts by ZIP code",
  },
  {
    key: "market",
    label: "Pulling market data",
    detail: "Live numbers for each neighborhood",
  },
  {
    key: "writing",
    label: "Writing your emails",
    detail: "A homeowner + buyer story per neighborhood",
  },
  {
    key: "assembling",
    label: "Designing & assembling",
    detail: "Your brand, the market snapshot, and imagery",
  },
];

/** Derive the active step, a percent floor/ceiling, and a sub-label from the
 *  run's real counters. Floor = where this state starts; the displayed percent
 *  eases from floor toward ceil over time so it always feels alive. */
function computeBuild(
  run: HlRun,
  emailCount: number,
): { activeKey: string; floor: number; ceil: number; sub?: string } {
  if (run.phase === "discover") {
    if (run.contacts_fetched > 0 && run.segments_count > 0)
      return { activeKey: "market", floor: 30, ceil: 42 };
    if (run.contacts_fetched > 0)
      return { activeKey: "mapping", floor: 18, ceil: 30 };
    return { activeKey: "reading", floor: 5, ceil: 18 };
  }
  if (run.phase === "generate" || run.phase === "awaiting_audience_confirmation") {
    const total = run.segments_count || 0;
    const frac = total > 0 ? Math.min(1, emailCount / total) : 0;
    const sub =
      total > 0 ? `${emailCount} of ${total} neighborhoods written` : undefined;
    if (frac < 0.95)
      return { activeKey: "writing", floor: 44 + frac * 42, ceil: 88, sub };
    return { activeKey: "assembling", floor: 90, ceil: 99, sub };
  }
  return { activeKey: "assembling", floor: 99, ceil: 100 };
}

export function MagicRunExperience({
  runId,
  initialRun,
}: {
  runId: string;
  initialRun: HlRun;
}) {
  const router = useRouter();
  const [data, setData] = useState<RunPayload>({
    run: initialRun,
    segments: [],
    emails: [],
  });
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which draft is selected in the master-detail review.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const autoSelected = useRef(false);
  // Displayed build percent — eases from the current step's floor toward its
  // ceiling so the bar always feels alive between 3s polls.
  const [pct, setPct] = useState(5);

  // Merge an edited email back into local state (review phase doesn't poll, so
  // this is the source of truth once drafts are ready).
  const updateEmail = useCallback((updated: HlEmail) => {
    setData((d) => ({
      ...d,
      emails: d.emails.map((e) =>
        e.id === updated.id ? { ...e, ...updated } : e,
      ),
    }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/hyperlocal/runs/${runId}`);
      if (!res.ok) return;
      setData((await res.json()) as RunPayload);
    } catch {
      /* next poll retries */
    }
  }, [runId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!POLL_PHASES.has(data.run.phase)) return;
    const id = setInterval(() => void fetchData(), 3000);
    return () => clearInterval(id);
  }, [data.run.phase, fetchData]);

  const working = WORKING_PHASES.has(data.run.phase);

  // Build-progress model derived from real run counters.
  const build = useMemo(
    () => computeBuild(data.run, data.emails.length),
    [
      data.run,
      data.emails.length,
    ],
  );

  // Never go backward; jump up to the new floor when a step advances.
  useEffect(() => {
    setPct((p) => Math.max(p, build.floor));
  }, [build.floor]);

  // Gentle ease toward the current ceiling while working.
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => {
      setPct((p) =>
        p < build.ceil
          ? Math.min(build.ceil, p + Math.max(0.3, (build.ceil - p) * 0.06))
          : p,
      );
    }, 450);
    return () => clearInterval(id);
  }, [working, build.ceil]);

  // If a Magic run lands somewhere only the full editor handles, bounce there.
  useEffect(() => {
    if (NEEDS_FULL_EDITOR.has(data.run.phase)) {
      router.replace(`/apps/hyperlocal/runs/${runId}`);
    }
  }, [data.run.phase, router, runId]);

  // Auto-select the first draft when drafts land, so the preview shows
  // immediately (no extra click to start reviewing).
  useEffect(() => {
    if (
      data.run.phase === "review" &&
      !autoSelected.current &&
      data.emails.length > 0
    ) {
      autoSelected.current = true;
      setSelectedId(data.emails[0].id);
    }
  }, [data.run.phase, data.emails]);

  const approveAll = useCallback(async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/hyperlocal/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve_all: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't send. Try the full editor.");
        setApproving(false);
        return;
      }
      await fetchData();
    } catch {
      setError("Couldn't send. Try the full editor.");
    } finally {
      setApproving(false);
    }
  }, [runId, fetchData]);

  const { run, emails } = data;

  const selectedEmail =
    emails.find((e) => e.id === selectedId) ?? emails[0] ?? null;

  return (
    <div
      className={cn(
        "mx-auto px-4 py-12",
        run.phase === "review" ? "max-w-5xl" : "max-w-2xl",
      )}
    >
      {/* Working — live multi-step build progress */}
      {working && (
        <CampaignBuildProgress
          phases={BUILD_PHASES}
          activeKey={build.activeKey}
          percent={pct}
          subLabel={build.sub}
        />
      )}

      {/* Review — one decision */}
      {run.phase === "review" && (
        <div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Your drafts are ready ✨</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {emails.length} neighborhood email{emails.length === 1 ? "" : "s"},
              written in your voice. Pick any to preview &amp; tweak, then send
              them all.
            </p>
          </div>

          {/* Master-detail: editor on the left, draft list + send on the right. */}
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="order-2 lg:order-1">
              {selectedEmail ? (
                <DraftEditorPane
                  key={selectedEmail.id}
                  runId={runId}
                  email={selectedEmail}
                  onUpdated={updateEmail}
                />
              ) : null}
            </div>
            <div className="order-1 lg:order-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {emails.length} draft{emails.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2 space-y-2">
                {emails.map((e) => (
                  <DraftListItem
                    key={e.id}
                    email={e}
                    active={selectedEmail?.id === e.id}
                    onClick={() => setSelectedId(e.id)}
                  />
                ))}
              </div>

              {/* Send — lives with the list */}
              <div className="mt-4 border-t border-border pt-4">
                {error && (
                  <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={approveAll}
                  disabled={approving || emails.length === 0}
                  className="w-full rounded-xl bg-[#F43F5E] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#F43F5E]/20 transition hover:bg-[#e11d48] disabled:opacity-60"
                >
                  {approving
                    ? "Sending…"
                    : `✨ Approve & send all ${emails.length}`}
                </button>
                <Link
                  href={`/apps/hyperlocal/runs/${runId}`}
                  className="mt-3 block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open the full editor
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sending */}
      {run.phase === "sending" && (
        <div className="text-center">
          <MagicOrb />
          <h1 className="mt-6 text-2xl font-semibold">Sending your campaign…</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Landing in inboxes across your sphere. You can leave this page.
          </p>
        </div>
      )}

      {/* Done */}
      {run.phase === "completed" && (
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
            🎉
          </div>
          <h1 className="mt-6 text-2xl font-semibold">It's out the door</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {run.emails_sent > 0
              ? `${run.emails_sent.toLocaleString()} emails sent across your sphere.`
              : "Your campaign has been sent."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/apps/hyperlocal/map"
              className="rounded-lg bg-[#F43F5E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e11d48]"
            >
              Back to your sphere
            </Link>
            <Link
              href="/apps/hyperlocal/dashboard"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              See the stats
            </Link>
          </div>
        </div>
      )}

      {/* Failed */}
      {(run.phase === "failed" || run.phase === "cancelled") && (
        <div className="text-center">
          <h1 className="text-2xl font-semibold">That didn't go through</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {run.error ?? "Something stalled while building your campaign."}
          </p>
          <Link
            href={`/apps/hyperlocal/runs/${runId}`}
            className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Open the full run
          </Link>
        </div>
      )}
    </div>
  );
}

/** A spinning, glowing orb — the "AI at work" motif. Pure CSS. */
function MagicOrb() {
  return (
    <div className="mx-auto h-16 w-16">
      <div className="h-full w-full animate-spin rounded-full border-[3px] border-[#F43F5E]/20 border-t-[#F43F5E] [animation-duration:1.2s]" />
    </div>
  );
}
