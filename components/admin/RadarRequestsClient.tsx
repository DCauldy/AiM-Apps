"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Admin queue for Radar setup requests.
//
// Two sections:
//   - Active     → pending / researching / ready_for_ops. Each row
//                  expands to show profile snapshot, auto-suggested
//                  competitors, and the "mark ready" form.
//   - Completed  → recent 30 (collapsed by default).
//
// Ops workflow per row (per the Otterly workspace+prompts model):
//   1. Open Otterly → AI Prompt Research → generate brand-specific
//      prompts for the customer's hostname.
//   2. Create a brand report attaching those prompts + the suggested
//      competitors (curating from the list shown here).
//   3. Paste the new brand report ID back into the form below.
//   4. Click "Mark ready" — customer gets the "your Radar is live"
//      email and the dashboard auto-flips on next load.
// ============================================================

interface SuggestedCompetitor {
  name: string;
  domain: string | null;
  source: "otterly_audit" | "llm_profile";
  rationale: string;
}

interface ProfileSnapshot {
  display_name: string | null;
  full_name: string | null;
  professional_type: string | null;
  brokerage: string | null;
  metro_area: string | null;
  state: string | null;
  target_clients: string[] | null;
  specializations: string[] | null;
  property_types: string[] | null;
  website_url: string | null;
  reply_to_email: string | null;
}

interface ActiveRequest {
  id: string;
  user_id: string;
  profile_id: string;
  hostname: string;
  status: "pending" | "researching" | "ready_for_ops";
  suggested_competitors: SuggestedCompetitor[];
  suggested_prompts: string[];
  research_error: string | null;
  ops_notes: string | null;
  requested_at: string;
  research_completed_at: string | null;
  requester_email: string | null;
  platform_profiles: ProfileSnapshot | null;
}

interface CompletedRequest {
  id: string;
  hostname: string;
  status: "completed";
  otterly_report_id: string | null;
  ops_notes: string | null;
  requested_at: string;
  completed_at: string | null;
  requester_email: string | null;
  platform_profiles: { display_name: string | null; full_name: string | null } | null;
}

interface ChangeRequest {
  id: string;
  user_id: string;
  profile_id: string;
  type: "add_prompt" | "add_competitor";
  payload: Record<string, unknown>;
  status: "pending" | "completed" | "rejected" | "cancelled";
  ops_notes: string | null;
  requested_at: string;
  completed_at: string | null;
  requester_email: string | null;
  platform_profiles: {
    display_name: string | null;
    full_name: string | null;
    website_url?: string | null;
  } | null;
}

interface ListResponse {
  active: ActiveRequest[];
  completed: CompletedRequest[];
  changeActive?: ChangeRequest[];
  changeCompleted?: ChangeRequest[];
}

export function RadarRequestsClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/radar-requests", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      addToast({
        title: "Couldn't load queue",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading queue…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <ActiveSection requests={data.active} onChange={load} />
      <ChangeRequestsSection
        requests={data.changeActive ?? []}
        onChange={load}
      />
      <CompletedSection requests={data.completed} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active section
// ---------------------------------------------------------------------------

function ActiveSection({
  requests,
  onChange,
}: {
  requests: ActiveRequest[];
  onChange: () => void;
}) {
  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">
          Active <span className="text-muted-foreground font-normal">({requests.length})</span>
        </h2>
      </header>
      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Nothing pending — queue is clear.
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <ActiveRow key={r.id} request={r} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActiveRow({
  request,
  onChange,
}: {
  request: ActiveRequest;
  onChange: () => void;
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [reportId, setReportId] = useState("");
  const [notes, setNotes] = useState(request.ops_notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleComplete = async () => {
    const trimmed = reportId.trim();
    if (!trimmed) {
      addToast({
        title: "Brand report ID required",
        description: "Paste the Otterly brand report ID before marking ready.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/radar-requests/${request.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otterly_report_id: trimmed, ops_notes: notes || undefined }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      addToast({
        title: "Marked ready",
        description: payload.email_sent
          ? "Customer notified by email."
          : "Completed, but email could not be sent — follow up manually.",
      });
      onChange();
    } catch (e) {
      addToast({
        title: "Couldn't mark ready",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const profile = request.platform_profiles;
  const requester = profile?.display_name ?? profile?.full_name ?? "(no name)";

  return (
    <li className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-medium">{request.hostname}</code>
            <StatusBadge status={request.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {requester}
            {request.requester_email ? ` <${request.requester_email}>` : ""} ·{" "}
            requested {formatRelative(request.requested_at)}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-border bg-muted/20">
          {/* Profile snapshot */}
          <div className="pt-4">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Profile snapshot
            </h3>
            <ProfileBlock profile={profile} />
          </div>

          {/* Suggested Otterly prompts — seed phrases for AI Prompt Research */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center justify-between">
              <span>
                Suggested Otterly prompts ({(request.suggested_prompts ?? []).length})
              </span>
            </h3>
            <PromptsBlock
              prompts={request.suggested_prompts ?? []}
              status={request.status}
            />
          </div>

          {/* Suggested competitors */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Auto-suggested competitors ({request.suggested_competitors.length})
            </h3>
            <CompetitorsBlock
              competitors={request.suggested_competitors}
              error={request.research_error}
              status={request.status}
            />
          </div>

          {/* Ops checklist */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Provisioning checklist
            </h3>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Open{" "}
                <a
                  href="https://app.otterly.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Otterly <ExternalLink className="h-3 w-3" />
                </a>{" "}
                → AI Prompt Research → generate prompts for{" "}
                <code className="text-foreground">{request.hostname}</code>.
                Otterly's prompt pool is workspace-scoped, so per-customer
                prompts won't pollute other reports.
              </li>
              <li>
                Create a new brand report:
                <code className="ml-1">brandDomain = {request.hostname}</code>{" "}
                — attach the fresh prompts + curate competitors from the
                suggestion list above.
              </li>
              <li>Copy the brand report ID (ULID) and paste below.</li>
              <li>Mark ready — customer gets emailed automatically.</li>
            </ol>
          </div>

          {/* Mark-ready form */}
          <div className="pt-2 space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Otterly brand report ID
              </label>
              <input
                type="text"
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                placeholder="01KV3KMXNJ2Y5JKVX6W8BBJDF0"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Ops notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything future-you should know about this setup."
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleComplete} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Marking ready…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark ready + notify customer
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Completed section
// ---------------------------------------------------------------------------

function CompletedSection({ requests }: { requests: CompletedRequest[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-lg font-semibold mb-3 hover:text-primary transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Recent completed{" "}
        <span className="text-muted-foreground font-normal">
          ({requests.length})
        </span>
      </button>
      {open && requests.length === 0 && (
        <div className="text-sm text-muted-foreground">None yet.</div>
      )}
      {open && requests.length > 0 && (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {requests.map((r) => (
            <li
              key={r.id}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-medium">{r.hostname}</code>
                  <span className="text-[11px] text-muted-foreground">
                    {r.platform_profiles?.display_name ??
                      r.platform_profiles?.full_name ??
                      ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  Report{" "}
                  <code className="text-foreground">
                    {r.otterly_report_id ?? "—"}
                  </code>{" "}
                  · completed {formatRelative(r.completed_at)}
                </div>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Change requests (add prompt / add competitor) — separate queue
// from setup requests. Same ops surface, lighter UI.
// ---------------------------------------------------------------------------

function ChangeRequestsSection({
  requests,
  onChange,
}: {
  requests: ChangeRequest[];
  onChange: () => void;
}) {
  if (requests.length === 0) return null;
  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">
          Change requests{" "}
          <span className="text-muted-foreground font-normal">
            ({requests.length})
          </span>
        </h2>
      </header>
      <ul className="rounded-lg border border-border bg-card divide-y divide-border">
        {requests.map((r) => (
          <ChangeRequestRow key={r.id} request={r} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}

function ChangeRequestRow({
  request,
  onChange,
}: {
  request: ChangeRequest;
  onChange: () => void;
}) {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState<"complete" | "reject" | null>(
    null,
  );

  const detail =
    request.type === "add_prompt"
      ? `"${String(request.payload.prompt ?? "")}"`
      : `${String(request.payload.brand ?? "")}${request.payload.domain ? ` (${String(request.payload.domain)})` : ""}`;
  const replaceDetail =
    request.type === "add_prompt" && request.payload.replace_prompt_text
      ? `Replaces: "${String(request.payload.replace_prompt_text)}"`
      : request.type === "add_competitor" && request.payload.replace_competitor_brand
        ? `Replaces: ${String(request.payload.replace_competitor_brand)}`
        : null;
  const requester =
    request.platform_profiles?.display_name ??
    request.platform_profiles?.full_name ??
    "(no name)";

  const handle = async (action: "complete" | "reject") => {
    setSubmitting(action);
    try {
      const res = await fetch(
        `/api/admin/radar-change-requests/${request.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      addToast({
        title: action === "complete" ? "Marked complete" : "Rejected",
      });
      onChange();
    } catch (e) {
      addToast({
        title: "Couldn't update request",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <li className="px-5 py-3 flex items-center gap-3">
      <span
        className={cn(
          "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0",
          request.type === "add_prompt"
            ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
            : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
        )}
      >
        {request.type === "add_prompt" ? "Prompt" : "Competitor"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{detail}</div>
        {replaceDetail && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium truncate mt-0.5">
            ↻ {replaceDetail}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground truncate">
          {requester}
          {request.requester_email ? ` <${request.requester_email}>` : ""} ·{" "}
          {request.platform_profiles?.website_url ?? "(no website)"} ·{" "}
          {formatRelative(request.requested_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => handle("reject")}
        disabled={submitting !== null}
        className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {submitting === "reject" ? "Rejecting…" : "Reject"}
      </button>
      <Button
        size="sm"
        onClick={() => handle("complete")}
        disabled={submitting !== null}
      >
        {submitting === "complete" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Done in Otterly
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: "pending" | "researching" | "ready_for_ops";
}) {
  const label =
    status === "pending"
      ? "Pending"
      : status === "researching"
        ? "Researching"
        : "Ready for ops";
  const cls =
    status === "ready_for_ops"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
      : status === "researching"
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border",
        cls,
      )}
    >
      {status === "researching" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {label}
    </span>
  );
}

function ProfileBlock({ profile }: { profile: ProfileSnapshot | null }) {
  if (!profile) {
    return (
      <div className="text-xs text-muted-foreground">
        (profile detail unavailable)
      </div>
    );
  }
  const rows: Array<[string, string | null]> = [
    ["Role", profile.professional_type],
    ["Brokerage", profile.brokerage],
    [
      "Geography",
      [profile.metro_area, profile.state].filter(Boolean).join(", ") || null,
    ],
    ["Target clients", profile.target_clients?.join(", ") ?? null],
    ["Specializations", profile.specializations?.join(", ") ?? null],
    ["Property types", profile.property_types?.join(", ") ?? null],
    ["Website", profile.website_url],
  ];
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
      {rows.map(([k, v]) =>
        v ? (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground truncate">{v}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function PromptsBlock({
  prompts,
  status,
}: {
  prompts: string[];
  status: "pending" | "researching" | "ready_for_ops";
}) {
  const { addToast } = useToast();
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (status === "researching" || status === "pending") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating seed prompts…
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        No prompts generated. You&apos;ll need to draft seed prompts manually
        in Otterly&apos;s AI Prompt Research tool.
      </div>
    );
  }

  const copy = async (text: string, label: string, idx: number | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      if (idx === "all") {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1500);
      } else {
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
      }
      addToast({ title: `Copied: ${label}` });
    } catch {
      addToast({
        title: "Copy failed",
        description: "Browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 border-b border-border">
        <p className="text-[11px] text-muted-foreground">
          Paste these seeds into Otterly → AI Prompt Research. Each seed
          expands into ~10 question variations.
        </p>
        <button
          type="button"
          onClick={() => copy(prompts.join("\n"), "all seeds", "all")}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-border bg-background hover:bg-muted transition-colors shrink-0"
        >
          {copiedAll ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy all
            </>
          )}
        </button>
      </div>
      <ul className="divide-y divide-border">
        {prompts.map((p, idx) => (
          <li
            key={`${idx}-${p}`}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 group"
          >
            <span className="flex-1 text-sm font-mono text-foreground truncate">
              {p}
            </span>
            <button
              type="button"
              onClick={() => copy(p, p, idx)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              title="Copy"
            >
              {copiedIdx === idx ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitorsBlock({
  competitors,
  error,
  status,
}: {
  competitors: SuggestedCompetitor[];
  error: string | null;
  status: "pending" | "researching" | "ready_for_ops";
}) {
  if (status === "researching" || status === "pending") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3 w-3 animate-spin" />
        Auto-research running… reload in a moment.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Partial research failure</div>
            <div className="font-mono text-[10px] mt-0.5">{error}</div>
          </div>
        </div>
      )}
      {competitors.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-2">
          No suggestions found. You'll need to research competitors manually.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {competitors.map((c, idx) => (
            <li
              key={`${c.source}-${idx}-${c.name}`}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                {c.domain && (
                  <a
                    href={`https://${c.domain.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {c.domain}
                  </a>
                )}
                <span
                  className={cn(
                    "ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                    c.source === "otterly_audit"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
                  )}
                >
                  {c.source === "otterly_audit" ? "AI-mentioned" : "Inferred"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {c.rationale}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
