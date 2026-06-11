"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Mail,
  MailOpen,
  MousePointerClick,
  Loader2,
  PlugZap,
  Plus,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  CmaClientFilter,
  CmaClientSummary,
  CmaClientsListResponse,
  CmaClientBulkAction,
} from "@/types/cma";

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTERS: Array<{ id: CmaClientFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending review" },
  { id: "enrolled", label: "Enrolled" },
  { id: "paused", label: "Paused" },
  { id: "unsubscribed", label: "Unsubscribed" },
];

// ---------------------------------------------------------------------------
// Engagement chip — populated by Wave 5 webhooks
// ---------------------------------------------------------------------------

function EngagementChip({ value }: { value: CmaClientSummary["engagement"] }) {
  if (value === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const map = {
    complained: { Icon: ShieldAlert, label: "Spam complaint", cls: "text-rose-400 border-rose-500/50 bg-rose-500/10" },
    bounced: { Icon: AlertTriangle, label: "Bounced", cls: "text-rose-400 border-rose-500/40 bg-rose-500/5" },
    clicked: { Icon: MousePointerClick, label: "Clicked", cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5" },
    opened: { Icon: MailOpen, label: "Opened", cls: "text-sky-400 border-sky-500/40 bg-sky-500/5" },
    delivered: { Icon: Mail, label: "Delivered", cls: "text-muted-foreground border-border bg-card" },
    cold: { Icon: Mail, label: "Cold", cls: "text-muted-foreground border-border bg-card" },
  } as const;
  const { Icon, label, cls } = map[value];
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", cls)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function StatusPill({ row }: { row: CmaClientSummary }) {
  if (row.unsubscribed_at) {
    return <Pill cls="text-rose-400 border-rose-500/40 bg-rose-500/5">Unsubscribed</Pill>;
  }
  if (row.paused) {
    return <Pill cls="text-amber-400 border-amber-500/40 bg-amber-500/5">Paused</Pill>;
  }
  if (row.enrolled) {
    return <Pill cls="text-emerald-400 border-emerald-500/40 bg-emerald-500/5">Enrolled</Pill>;
  }
  return <Pill cls="text-muted-foreground border-border bg-card">Pending</Pill>;
}

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", cls)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClientsClient({
  hasCrmConnection,
}: {
  hasCrmConnection: boolean;
}) {
  const { addToast } = useToast();

  const [filter, setFilter] = useState<CmaClientFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clients, setClients] = useState<CmaClientSummary[]>([]);
  const [counts, setCounts] = useState<Record<CmaClientFilter, number>>({
    all: 0,
    pending: 0,
    enrolled: 0,
    paused: 0,
    unsubscribed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce the search box — 300ms is the sweet spot for "feels live"
  // without hammering the API while the user is mid-keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      const res = await fetch(
        `/api/apps/listing-studio/clients?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as CmaClientsListResponse | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to load");
      }
      setClients(data.clients);
      setCounts(data.counts);
    } catch (e) {
      addToast({
        title: "Couldn't load clients",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, addToast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Clear selection when the visible set changes.
  useEffect(() => {
    setSelected(new Set());
  }, [filter, debouncedSearch]);

  const allVisibleSelected = useMemo(
    () => clients.length > 0 && clients.every((c) => selected.has(c.id)),
    [clients, selected],
  );

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clients.map((c) => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (action: CmaClientBulkAction) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/apps/listing-studio/clients/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_ids: Array.from(selected),
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk action failed");
      const okCount = data.ok?.length ?? 0;
      const failCount = data.failed?.length ?? 0;
      addToast({
        title: `${okCount} updated`,
        description:
          failCount > 0
            ? `${failCount} skipped — likely cap reached or row missing`
            : "",
        variant: failCount > 0 ? "default" : "default",
      });
      setSelected(new Set());
      await loadList();
    } catch (e) {
      addToast({
        title: "Bulk action failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // First-run / zero-state: no CRM connection AND no clients. Point
  // the agent at the settings tab where they'll wire one up.
  const isEmpty = !loading && clients.length === 0 && counts.all === 0;
  const showOnboarding = isEmpty && !hasCrmConnection;

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <Header counts={counts} />

        {showOnboarding ? (
          <OnboardingEmptyState />
        ) : (
          <>
            <FilterRow
              counts={counts}
              active={filter}
              onChange={setFilter}
              search={search}
              onSearchChange={setSearch}
            />

            {selected.size > 0 && (
              <BulkBar
                count={selected.size}
                busy={bulkBusy}
                onClear={() => setSelected(new Set())}
                onBulk={bulk}
              />
            )}

            <ClientTable
              clients={clients}
              loading={loading}
              selected={selected}
              allVisibleSelected={allVisibleSelected}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
            />

            {isEmpty && hasCrmConnection && (
              <ManualClientHint />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ counts }: { counts: Record<CmaClientFilter, number> }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Past clients pulled from your CRM. Enrolled clients receive a fresh
          CMA on cadence (default every 90 days).
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold text-foreground">{counts.enrolled}</span>
          <span>enrolled</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter row (tabs + search)
// ---------------------------------------------------------------------------

function FilterRow({
  counts,
  active,
  onChange,
  search,
  onSearchChange,
}: {
  counts: Record<CmaClientFilter, number>;
  active: CmaClientFilter;
  onChange: (v: CmaClientFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium border transition-colors",
              active === f.id
                ? "border-[#D4A35C] bg-[#D4A35C]/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <span>{f.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold",
                active === f.id ? "bg-[#D4A35C]/20 text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>
      <div className="relative sm:ml-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or address…"
          className="w-full sm:w-64 rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar
// ---------------------------------------------------------------------------

function BulkBar({
  count,
  busy,
  onClear,
  onBulk,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onBulk: (a: CmaClientBulkAction) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#D4A35C]/40 bg-[#D4A35C]/5 px-3 py-2">
      <span className="text-sm font-medium">
        {count} selected
      </span>
      <div className="ml-auto flex gap-1">
        <BulkBtn busy={busy} onClick={() => onBulk("enroll")} Icon={CheckCircle2}>Enroll</BulkBtn>
        <BulkBtn busy={busy} onClick={() => onBulk("unenroll")} Icon={XCircle}>Unenroll</BulkBtn>
        <BulkBtn busy={busy} onClick={() => onBulk("pause")} Icon={PauseCircle}>Pause</BulkBtn>
        <BulkBtn busy={busy} onClick={() => onBulk("resume")} Icon={PlayCircle}>Resume</BulkBtn>
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function BulkBtn({
  busy,
  onClick,
  Icon,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function ClientTable({
  clients,
  loading,
  selected,
  allVisibleSelected,
  onToggleAll,
  onToggleOne,
}: {
  clients: CmaClientSummary[];
  loading: boolean;
  selected: Set<string>;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (clients.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
        No clients match this filter.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2 text-left">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleAll}
                className="h-3.5 w-3.5 cursor-pointer rounded border-border"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium">Client</th>
            <th className="px-3 py-2 text-left font-medium">Address</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Cadence</th>
            <th className="px-3 py-2 text-left font-medium">Last sent</th>
            <th className="px-3 py-2 text-left font-medium">Engagement</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr
              key={c.id}
              className={cn(
                "border-t border-border transition-colors",
                selected.has(c.id) ? "bg-[#D4A35C]/5" : "hover:bg-muted/30",
              )}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => onToggleOne(c.id)}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-border"
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/apps/cma/clients/${c.id}`}
                  className="text-foreground hover:text-[#D4A35C] font-medium"
                >
                  {clientName(c)}
                </Link>
                {c.email && (
                  <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                    {c.email}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground text-[12px] max-w-[280px]">
                <div className="truncate" title={c.address ?? undefined}>{c.address ?? "—"}</div>
              </td>
              <td className="px-3 py-2.5">
                <StatusPill row={c} />
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {c.cadence_days ? `${c.cadence_days}d` : "default"}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {c.last_delivered_at ? relativeDate(c.last_delivered_at) : "never"}
              </td>
              <td className="px-3 py-2.5">
                <EngagementChip value={c.engagement} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function OnboardingEmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <PlugZap className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Connect your CRM to get started</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        CMA pulls your past clients from Follow Up Boss, Lofty, Sierra, or
        BoldTrail. Configure the stage or tag that identifies a closed
        client, sync, and we&apos;ll surface everyone with a stored property
        address for review.
      </p>
      <Link
        href="/apps/cma/settings?tab=integrations"
        className="mt-6 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)" }}
      >
        <PlugZap className="h-3.5 w-3.5" />
        Open settings
      </Link>
    </div>
  );
}

function ManualClientHint() {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
      <div className="inline-flex items-center gap-1.5 text-xs">
        <Users className="h-3.5 w-3.5" />
        Synced from your CRM, but no past clients matched the filter yet.
        Adjust the stage/tag in settings, or add one manually:
      </div>
      <button
        type="button"
        disabled
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium opacity-50"
        title="Manual create lands in Wave 6"
      >
        <Plus className="h-3.5 w-3.5" />
        Add client
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientName(c: CmaClientSummary): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || c.email || "Unknown";
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `in ${Math.abs(days)}d`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
