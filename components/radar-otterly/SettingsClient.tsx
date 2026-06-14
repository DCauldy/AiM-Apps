"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bell,
  Check,
  Database,
  Loader2,
  ExternalLink,
  Mail,
  Plus,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { RADAR_INCLUDED_TIER, RADAR_PACKS } from "@/lib/radar-packs";
import { RadarUpgradeModal } from "@/components/radar-otterly/RadarUpgradeModal";
import type {
  OtterlyAccountInfo,
  OtterlyBrandReport,
} from "@/lib/radar-otterly/types";

// ============================================================
// Settings — tabbed surface matching the other apps' settings.
//
//   Tracking  → read-only view of what's being tracked.
//   Quota     → account-level usage bars (prompts, audits, API).
//   Upgrade   → Bronze / Silver / Gold / Diamond tier ladder
//               + Stripe portal for managing existing subscription.
//
// Mutating notification/alert prefs land later when schema exists.
// ============================================================

type SettingsStatus =
  | "ready"
  | "no_active_profile"
  | "no_website_url"
  | "no_matching_report"
  | "otterly_error";

interface SettingsResponse {
  status: SettingsStatus;
  report?: OtterlyBrandReport;
  account?: OtterlyAccountInfo;
  websiteUrl?: string;
  capacity?: {
    promptsCap: number;
    promptsUsed: number;
    competitorsCap: number;
    competitorsUsed: number;
  };
  trackedPrompts?: Array<{ id: string; prompt: string }>;
  error?: { message: string; status: number };
}

type Tab = "tracking" | "quota" | "notifications" | "upgrade";

const TABS: { id: Tab; label: string }[] = [
  { id: "tracking", label: "Tracking" },
  { id: "quota", label: "Quota" },
  { id: "notifications", label: "Notifications" },
  { id: "upgrade", label: "Upgrade" },
];

export function RadarSettingsClient() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "tracking";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.find((t) => t.id === initialTab) ? initialTab : "tracking",
  );
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/settings", {
        cache: "no-store",
      });
      const payload = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error("Failed to load Settings");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Settings",
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

  if (loading && !data) return <SettingsSkeleton />;
  if (!data) return <SettingsSkeleton />;

  if (data.status !== "ready") {
    return (
      <GateState
        title={statusTitle(data.status)}
        body={
          data.status === "otterly_error"
            ? `Couldn't load settings right now. ${data.error?.message ?? ""}`
            : "Settings will populate once tracking is set up for your active profile."
        }
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tracking config, usage quota, and your Radar subscription.
          </p>
        </div>

        <div className="border-b border-border -mx-4 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-4 sm:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#e0a458] rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "tracking" && (
          <TrackingTab
            report={data.report!}
            websiteUrl={data.websiteUrl ?? ""}
            capacity={data.capacity ?? null}
            trackedPrompts={data.trackedPrompts ?? []}
          />
        )}
        {activeTab === "quota" && <QuotaTab account={data.account!} />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "upgrade" && (
          <UpgradeTab
            account={data.account!}
            onChange={load}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab — Tracking
// ---------------------------------------------------------------------------

function TrackingTab({
  report,
  websiteUrl,
  capacity,
  trackedPrompts,
}: {
  report: OtterlyBrandReport;
  websiteUrl: string;
  capacity: {
    promptsCap: number;
    promptsUsed: number;
    competitorsCap: number;
    competitorsUsed: number;
  } | null;
  trackedPrompts: Array<{ id: string; prompt: string }>;
}) {
  const competitorList = report.competitors
    .map((c) => c.brand)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            What we&apos;re tracking
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Read-only. Need changes? Ping AiM support and we&apos;ll update
            your tracking config.
          </p>
        </header>
        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-3 gap-x-4 p-5 text-sm">
          <Row label="Brand" value={report.brand} />
          <Row label="Brand domain" value={report.brandDomain} />
          <Row label="Profile website" value={websiteUrl} />
          <Row
            label="Domain variations"
            value={
              report.brandDomainVariations.length > 0
                ? report.brandDomainVariations.join(", ")
                : "—"
            }
          />
          <Row
            label="Countries"
            value={report.countries.map((c) => c.toUpperCase()).join(", ")}
          />
          <Row
            label="Competitors tracked"
            value={
              report.competitors.length > 0
                ? `${report.competitors.length} · ${competitorList}`
                : "None"
            }
          />
          <Row
            label="Created"
            value={new Date(report.createdDate).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          />
        </dl>
      </section>

      <CustomizeSection
        capacity={capacity}
        trackedPrompts={trackedPrompts}
        competitors={report.competitors.map((c) => ({
          brand: c.brand,
          domain: c.brandDomain,
        }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customize — customer self-service add prompt / add competitor
// ---------------------------------------------------------------------------

function CustomizeSection({
  capacity,
  trackedPrompts,
  competitors,
}: {
  capacity: {
    promptsCap: number;
    promptsUsed: number;
    competitorsCap: number;
    competitorsUsed: number;
  } | null;
  trackedPrompts: Array<{ id: string; prompt: string }>;
  competitors: Array<{ brand: string; domain: string }>;
}) {
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
  const [recent, setRecent] = useState<
    Array<{
      id: string;
      type: "add_prompt" | "add_competitor";
      payload: Record<string, unknown>;
      status: string;
      requested_at: string;
      completed_at: string | null;
    }>
  >([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/apps/radar/requests", {
        cache: "no-store",
      });
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
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenForm(null)}
                className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={
                  submitting ||
                  promptText.trim().length < 4 ||
                  (promptsAtCap && !replacePromptId)
                }
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
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenForm(null)}
                className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={
                  submitting ||
                  competitorBrand.trim().length === 0 ||
                  (competitorsAtCap && !replaceCompetitorBrand)
                }
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
          </div>
        )}

        {/* Recent requests */}
        {!loadingRecent && recent.length > 0 && (
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
        )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground break-words">{value}</dd>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab — Quota
// ---------------------------------------------------------------------------

function QuotaTab({
  account: _account,
}: {
  account: OtterlyAccountInfo;
}) {
  // Shows the customer's personal allocation from their current
  // plan tier — NOT the Otterly account-level numbers (which are
  // shared across every AiM customer and confusing in context).
  //
  // Hardcoded to RADAR_INCLUDED_TIER until per-customer subscription
  // schema exists. When that lands, look up the user's pack and use
  // it here instead.
  const tier = RADAR_INCLUDED_TIER;
  const refreshLabel =
    tier.refreshFrequency === "weekly"
      ? "Weekly refresh"
      : "Daily refresh";

  const allocations: Array<{ label: string; value: string }> = [
    { label: "Tracked prompts", value: tier.prompts.toLocaleString() },
    { label: "Competitors", value: tier.competitors.toLocaleString() },
    {
      label: "URL audits / month",
      value: tier.auditsPerMonth.toLocaleString(),
    },
    { label: "Refresh cadence", value: refreshLabel },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Your allocation</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              What&apos;s included with your{" "}
              <span className="font-medium text-foreground">{tier.tier}</span>{" "}
              plan.
            </p>
          </div>
        </header>
        <ul className="divide-y divide-border">
          {allocations.map((a) => (
            <li
              key={a.label}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <span className="text-sm">{a.label}</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {a.value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-muted-foreground text-center">
        Want more? Head to the Upgrade tab for Bronze / Silver / Gold / Diamond
        packs.
      </p>
    </div>
  );
}

function IncludedStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <li>
      <div className="text-base font-semibold text-foreground tabular-nums">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tab — Upgrade (Bronze / Silver / Gold / Diamond)
//
// Mirrors the Blog Engine / Hyperlocal / Listing Studio pattern:
//   1. Top card — current tier pill + "Manage Subscription" (when on
//      a paid pack) OR "Pro (included)" pill + "See packs" CTA.
//   2. Pack ladder — small cards click-to-open the upgrade modal.
//   3. Reset onboarding affordance lives elsewhere for Radar
//      because there isn't a per-customer onboarding to reset.
//
// Current-tier detection lands later once we have a
// user_radar_subscriptions table. For now we surface "Pro (included)"
// as the implicit starter state and let any pack click trigger the
// upgrade modal.
// ---------------------------------------------------------------------------

function UpgradeTab({
  account: _account,
  onChange: _onChange,
}: {
  account: OtterlyAccountInfo;
  onChange: () => void;
}) {
  const { addToast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managing, setManaging] = useState(false);

  // Until we have a user_radar_subscriptions table, we don't know the
  // user's current Radar pack. Treat everyone as "Pro (included)"
  // (starter allocation). Pack cards always open the upgrade modal.
  const hasSubscription = false;
  const currentPackId: string | null = null;

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await fetch("/api/apps/radar/manage-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        addToast({
          title: "Error",
          description: data.error || "Failed to open subscription portal",
          variant: "destructive",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "Network error — could not reach server",
        variant: "destructive",
      });
    } finally {
      setManaging(false);
    }
  };

  return (
    <div className="space-y-6">
      {hasSubscription ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
                  }}
                >
                  <Zap className="h-3 w-3" />
                  {currentPackId
                    ? RADAR_PACKS.find((p) => p.id === currentPackId)?.tier
                    : "Bronze"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Update card, change tier, or cancel through the Stripe billing
                portal.
              </p>
            </div>
            <button
              onClick={handleManage}
              disabled={managing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {managing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Manage Subscription
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground">
                  Pro (included)
                </span>
                <span className="text-sm text-muted-foreground">
                  Included with your AiM Pro membership
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upgrade for more tracked prompts, competitors, and faster
                refresh.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              See packs
            </button>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border text-xs">
            <IncludedStat
              label="Tracked prompts"
              value={RADAR_INCLUDED_TIER.prompts}
            />
            <IncludedStat
              label="Competitors"
              value={RADAR_INCLUDED_TIER.competitors}
            />
            <IncludedStat
              label="URL audits / mo"
              value={RADAR_INCLUDED_TIER.auditsPerMonth}
            />
            <IncludedStat
              label="Refresh"
              value={
                RADAR_INCLUDED_TIER.refreshFrequency === "weekly"
                  ? "Weekly"
                  : "Daily"
              }
            />
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">All packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {RADAR_PACKS.map((pack) => {
            const isCurrent = hasSubscription && currentPackId === pack.id;
            const refreshLabel =
              pack.refreshFrequency === "weekly"
                ? "weekly"
                : pack.refreshFrequency === "daily"
                  ? "daily"
                  : "2x daily";
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  isCurrent
                    ? "border-[#e0a458] bg-[#e0a458]/5"
                    : "border-border hover:border-[#1c4c8a]/50",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">
                    {pack.tier}
                  </span>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#e0a458]">
                      <Check className="h-3 w-3" />
                      Current
                    </span>
                  )}
                  {pack.bestValue && !isCurrent && (
                    <span className="inline-flex items-center text-[10px] font-medium text-white bg-[#e0a458] px-1.5 py-0.5 rounded">
                      Best value
                    </span>
                  )}
                </div>
                <div className="text-xl font-semibold text-foreground">
                  ${(pack.priceCents / 100).toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /mo
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                  <div>
                    <span className="text-foreground font-medium tabular-nums">
                      {pack.prompts}
                    </span>{" "}
                    prompts ·{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {pack.competitors}
                    </span>{" "}
                    competitors
                  </div>
                  <div>{refreshLabel} refresh</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <RadarUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="cta"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coming soon
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Notifications tab — email alert + weekly digest opt-in toggles
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  alerts_enabled: boolean;
  digest_enabled: boolean;
  last_alert_sent_at: string | null;
  last_digest_sent_at: string | null;
}

function NotificationsTab() {
  const { addToast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/apps/radar/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPrefs(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (key: "alerts_enabled" | "digest_enabled") => {
    if (!prefs) return;
    const next = !prefs[key];
    setSaving(key);
    // Optimistic update.
    setPrefs({ ...prefs, [key]: next });
    try {
      const res = await fetch("/api/apps/radar/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) throw new Error("update failed");
    } catch (e) {
      // Roll back optimistic update on failure.
      setPrefs({ ...prefs });
      addToast({
        title: "Couldn't update",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  if (!prefs) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
        Loading preferences…
      </div>
    );
  }

  const toggles: Array<{
    key: "alerts_enabled" | "digest_enabled";
    icon: React.ReactNode;
    label: string;
    description: string;
    lastSent: string | null;
  }> = [
    {
      key: "alerts_enabled",
      icon: <Bell className="h-4 w-4 text-rose-400" />,
      label: "Rank-drop alerts",
      description:
        "Email me when my AI rank drops or a competitor passes me. Sent at most once per 24h per event.",
      lastSent: prefs.last_alert_sent_at,
    },
    {
      key: "digest_enabled",
      icon: <Mail className="h-4 w-4 text-sky-400" />,
      label: "Weekly digest",
      description:
        "Monday morning summary: average rank, mention rate, top wins, and biggest gaps.",
      lastSent: prefs.last_digest_sent_at,
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Email notifications</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Delivered to your account email. Edit either anytime.
        </p>
      </header>
      <ul className="divide-y divide-border">
        {toggles.map((t) => (
          <li key={t.key} className="px-5 py-4 flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{t.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t.label}</div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t.description}
              </p>
              {t.lastSent && (
                <div className="text-[10px] text-muted-foreground/70 mt-1">
                  Last sent{" "}
                  {new Date(t.lastSent).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggle(t.key)}
              disabled={saving === t.key}
              className={cn(
                "shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                prefs[t.key]
                  ? "bg-[#e0a458]"
                  : "bg-muted",
                saving === t.key && "opacity-50",
              )}
              role="switch"
              aria-checked={prefs[t.key]}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  prefs[t.key] ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skeleton + gate
// ---------------------------------------------------------------------------

function statusTitle(status: SettingsStatus): string {
  switch (status) {
    case "no_active_profile":
      return "Set up a profile first";
    case "no_website_url":
      return "Add your website URL";
    case "no_matching_report":
      return "Tracking isn't set up yet";
    case "otterly_error":
      return "Settings are temporarily unavailable";
    default:
      return "";
  }
}

function SettingsSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-10 w-64 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

function GateState({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {String(body).startsWith("Couldn't") ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <ExternalLink className="h-6 w-6" />
            )}
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
