"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  OtterlyAuditCheck,
  OtterlyContentCheckDetail,
  OtterlyCrawlabilityCheckDetail,
} from "@/lib/radar-otterly/types";

// Collapsed-by-default history of prior audits. Click a row to load
// detail (lazy). Polls every 4s while a row is open and the audit
// status is still pending/running.

export function HistorySection({
  contentChecks,
  crawlabilityChecks,
}: {
  contentChecks: OtterlyAuditCheck[];
  crawlabilityChecks: OtterlyAuditCheck[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"content" | "crawlability">("content");

  const total = contentChecks.length + crawlabilityChecks.length;
  if (total === 0) return null;

  const list = tab === "content" ? contentChecks : crawlabilityChecks;
  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
  );

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold">Audit history ({total})</h2>
      </button>
      {open && (
        <>
          <div className="px-5 pb-3 flex items-center gap-1">
            {(["content", "crawlability"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md transition-colors",
                  tab === k
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "content" ? "Content" : "Crawlability"} (
                {k === "content"
                  ? contentChecks.length
                  : crawlabilityChecks.length}
                )
              </button>
            ))}
          </div>
          {sorted.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No {tab} audits yet.
            </div>
          ) : (
            <ul className="border-t border-border divide-y divide-border">
              {sorted.map((audit) => (
                <AuditRow key={audit.id} audit={audit} type={tab} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function AuditRow({
  audit,
  type,
}: {
  audit: OtterlyAuditCheck;
  type: "content" | "crawlability";
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<
    OtterlyContentCheckDetail | OtterlyCrawlabilityCheckDetail | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/apps/radar/optimize/audit/${type}/${audit.id}`,
        { cache: "no-store" },
      );
      const payload = await res.json();
      if (payload.status !== "ready" || !payload.audit) {
        throw new Error(payload.error?.message ?? "Detail unavailable");
      }
      setDetail(payload.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [audit.id, type]);

  useEffect(() => {
    if (!open || detail) return;
    fetchDetail();
  }, [open, detail, fetchDetail]);

  useEffect(() => {
    if (!open || !detail) return;
    const status = detail.status;
    if (status === "completed" || status === "finished" || status === "failed") {
      return;
    }
    const id = setInterval(fetchDetail, 4_000);
    return () => clearInterval(id);
  }, [open, detail, fetchDetail]);

  const createdLabel = new Date(audit.createdDate).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const contentDetail =
    type === "content" && detail
      ? (detail as OtterlyContentCheckDetail)
      : null;
  const overallScore =
    contentDetail?.structuralAnalysis?.overallScore != null
      ? Math.round(contentDetail.structuralAnalysis.overallScore)
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{audit.url}</div>
          <div className="text-[11px] text-muted-foreground">
            {createdLabel}
          </div>
        </div>
        {overallScore != null && (
          <span
            className={cn(
              "text-xs font-medium tabular-nums px-2 py-0.5 rounded shrink-0",
              overallScore >= 80
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : overallScore >= 60
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            )}
          >
            {overallScore}
          </span>
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border bg-muted/20">
          {loading && !detail && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading detail…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 mt-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          {detail && type === "content" && (
            <ContentCheckDetailView detail={detail as OtterlyContentCheckDetail} />
          )}
          {detail && type === "crawlability" && (
            <CrawlabilityCheckDetailView
              detail={detail as OtterlyCrawlabilityCheckDetail}
            />
          )}
        </div>
      )}
    </li>
  );
}

function ContentCheckDetailView({
  detail,
}: {
  detail: OtterlyContentCheckDetail;
}) {
  const status = detail.status;
  if (status !== "completed" && status !== "finished") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Audit in progress ({status}) — polling every 4s.
      </div>
    );
  }
  const sa = detail.structuralAnalysis;
  if (!sa) {
    return (
      <div className="text-xs text-muted-foreground py-4 italic">
        Audit completed but no structural analysis returned.
      </div>
    );
  }
  return (
    <div className="pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { key: "metadata", label: "Metadata" },
            { key: "technical", label: "Technical" },
            { key: "structure", label: "Structure" },
            { key: "content", label: "Content" },
          ] as const
        ).map((c) => {
          const score = sa.categoryScores[c.key];
          return (
            <div
              key={c.key}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  score >= 80
                    ? "text-emerald-500"
                    : score >= 60
                      ? "text-amber-500"
                      : "text-rose-500",
                )}
              >
                {Math.round(score)}
              </div>
            </div>
          );
        })}
      </div>
      {detail.dynamicContent && (
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Dynamic content score
              </div>
              <div className="text-sm">
                {Math.round(detail.dynamicContent.score)}/100 ·{" "}
                {detail.dynamicContent.differenceDescription}
              </div>
            </div>
            {detail.dynamicContent.isPotentiallyBlocked && (
              <span className="text-[10px] px-2 py-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 shrink-0">
                Possibly blocked
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CrawlabilityCheckDetailView({
  detail,
}: {
  detail: OtterlyCrawlabilityCheckDetail;
}) {
  const status = detail.status;
  if (status !== "completed" && status !== "finished") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Audit in progress ({status}) — polling every 4s.
      </div>
    );
  }
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 text-xs text-emerald-500 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Crawlability check completed.
      </div>
      <pre className="text-[10px] bg-background border border-border rounded p-3 overflow-auto max-h-64 font-mono text-muted-foreground">
        {JSON.stringify(detail.results ?? {}, null, 2)}
      </pre>
      <p className="text-[11px] text-muted-foreground mt-2 italic">
        Crawlability response shape will be typed once we have a finished run
        to inspect.
      </p>
    </div>
  );
}
