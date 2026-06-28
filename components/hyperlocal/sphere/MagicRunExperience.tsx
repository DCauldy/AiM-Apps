"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CampaignBuildProgress,
  type BuildPhase,
} from "@/components/hyperlocal/sphere/CampaignBuildProgress";
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
  // Displayed build percent — eases from the current step's floor toward its
  // ceiling so the bar always feels alive between 3s polls.
  const [pct, setPct] = useState(5);

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
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
              written in your voice. Send them all, or open the editor to tweak.
            </p>
          </div>

          <div className="mt-6 space-y-2">
            {emails.map((e) => (
              <DraftCard key={e.id} email={e} />
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={approveAll}
              disabled={approving || emails.length === 0}
              className="w-full rounded-xl bg-[#F43F5E] px-4 py-3 text-base font-semibold text-white shadow-lg shadow-[#F43F5E]/20 transition hover:bg-[#e11d48] disabled:opacity-60"
            >
              {approving ? "Sending…" : `✨ Approve & send all ${emails.length}`}
            </button>
            <Link
              href={`/apps/hyperlocal/runs/${runId}`}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              Review each email in the editor
            </Link>
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

function DraftCard({ email }: { email: HlEmail }) {
  const snippet = htmlSnippet(
    email.html ??
      email.seller_perspective_html ??
      email.buyer_perspective_html ??
      "",
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">
        {email.subject || "Writing subject…"}
      </p>
      {email.preheader && (
        <p className="mt-0.5 text-xs text-muted-foreground">{email.preheader}</p>
      )}
      {snippet && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {snippet}
        </p>
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

function htmlSnippet(html: string, max = 140): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
