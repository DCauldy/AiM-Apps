"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  PlugZap,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { CRM_PLATFORM_LABELS } from "@/types/hyperlocal";
import type { CrmPlatform } from "@/types/hyperlocal";
import type {
  AppSlug,
  CmaCrmFilterConfig,
  HlCrmFilterConfig,
  PlatformCrmConnectionPublic,
} from "@/types/platform-connections";

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

interface AppStateSummary {
  app: AppSlug;
  state_id: string;
  last_synced_at: string | null;
  last_error: string | null;
}

interface CrmConnEntry {
  connection: PlatformCrmConnectionPublic;
  used_by: AppStateSummary[];
}

const APP_LABELS: Record<AppSlug, string> = {
  hyperlocal: "Hyperlocal",
  listing_studio: "CMA",
};

// CRM platforms each app supports — narrowed at the connect modal so
// the agent only sees options the chosen app can actually use.
const HL_PLATFORMS: CrmPlatform[] = [
  "followupboss",
  "lofty",
  "sierra",
  "boldtrail",
  "cinc",
  "cloze",
  "gohighlevel",
];
const CMA_PLATFORMS: CrmPlatform[] = [
  "followupboss",
  "lofty",
  "sierra",
  "boldtrail",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function ProfileCrmTab() {
  const { addToast } = useToast();
  const [conns, setConns] = useState<CrmConnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // "__multi__" opens the new multi-app modal. Kept as a string flag
  // rather than a boolean so we can grow other modal variants later
  // without changing state shape.
  const [connectKind, setConnectKind] = useState<"__multi__" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/integrations/crm-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setConns(data.connections as CrmConnEntry[]);
    } catch (e) {
      addToast({
        title: "Couldn't load CRM connections",
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">CRM connections</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            The CRMs each app pulls contacts from. Auth lives on this
            profile; per-app filters (which contacts qualify) live
            below each connection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConnectKind("__multi__")}
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Connect CRM
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : conns.length === 0 ? (
        <EmptyState onAdd={() => setConnectKind("__multi__")} />
      ) : (
        <div className="space-y-3">
          {conns.map((entry) => (
            <ConnCard
              key={entry.connection.id}
              entry={entry}
              onDeleted={() =>
                setConns((p) =>
                  p.filter((e) => e.connection.id !== entry.connection.id),
                )
              }
              onReload={load}
            />
          ))}
        </div>
      )}

      {connectKind && (
        <ConnectModal
          onClose={() => setConnectKind(null)}
          onSaved={() => {
            setConnectKind(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <PlugZap className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No CRM connected yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Connect Follow Up Boss, Lofty, Sierra, or BoldTrail to start
        pulling past clients into the CMA cadence, or to power
        Hyperlocal segments.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)" }}
      >
        <Plus className="h-3.5 w-3.5" />
        Connect your first CRM
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection card
// ---------------------------------------------------------------------------

function ConnCard({
  entry,
  onDeleted,
  onReload,
}: {
  entry: CrmConnEntry;
  onDeleted: () => void;
  onReload: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"delete" | null>(null);
  const c = entry.connection;

  const handleDelete = async () => {
    const usageList = entry.used_by.map((u) => APP_LABELS[u.app]).join(", ");
    if (
      !confirm(
        entry.used_by.length > 0
          ? `Disconnect ${CRM_PLATFORM_LABELS[c.platform]} from every app (${usageList})? Existing synced clients stay; future syncs stop.`
          : `Delete this ${CRM_PLATFORM_LABELS[c.platform]} connection?`,
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(
        `/api/profile/integrations/crm-connections/${c.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        addToast({
          title: "Delete failed",
          description: data?.error,
          variant: "destructive",
        });
        return;
      }
      onDeleted();
      addToast({ title: "Disconnected" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-5 flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
          <Database className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              {CRM_PLATFORM_LABELS[c.platform]}
            </h3>
            {c.label && (
              <span className="text-xs text-muted-foreground">· {c.label}</span>
            )}
            {!c.is_active && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-500/40 text-amber-400 bg-amber-500/5">
                Inactive
              </span>
            )}
          </div>
          {entry.used_by.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Not wired into any app yet.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {entry.used_by.map((u) => (
                <span
                  key={u.state_id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#D4A35C]/40 text-[#D4A35C] bg-[#D4A35C]/5"
                >
                  {APP_LABELS[u.app]}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {busy === "delete" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          Disconnect
        </button>
      </div>

      {entry.used_by.length > 0 && (
        <div className="border-t border-border">
          {entry.used_by.map((u) => (
            <PerAppFilterPanel
              key={u.state_id}
              connectionId={c.id}
              app={u.app}
              lastSyncedAt={u.last_synced_at}
              lastError={u.last_error}
              onSaved={onReload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-app filter panel (expandable)
// ---------------------------------------------------------------------------

function PerAppFilterPanel({
  connectionId,
  app,
  lastSyncedAt,
  lastError,
  onSaved,
}: {
  connectionId: string;
  app: AppSlug;
  lastSyncedAt: string | null;
  lastError: string | null;
  onSaved: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncNow = async (e: React.MouseEvent) => {
    // Stop the panel expand/collapse from firing.
    e.stopPropagation();
    setSyncing(true);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/crm-connections/${connectionId}/sync`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        addToast({
          title: "Sync failed",
          description: data?.error ?? `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      const created = data?.candidates_created ?? 0;
      const updated = data?.candidates_updated ?? 0;
      const total = data?.candidates_total ?? 0;
      addToast({
        title: "Sync complete",
        description:
          total === 0
            ? "No past clients matched your filter."
            : `${created} new, ${updated} updated (${total} total).`,
      });
      await onSaved();
    } catch (e) {
      addToast({
        title: "Sync failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="px-5 py-3 border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">
            {APP_LABELS[app]} filter
          </span>
          {lastSyncedAt && (
            <span className="text-[11px] text-muted-foreground">
              · synced {new Date(lastSyncedAt).toLocaleDateString()}
            </span>
          )}
          {lastError && (
            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle className="h-3 w-3" />
              {lastError.slice(0, 60)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {app === "listing_studio" && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleSyncNow}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handleSyncNow(e as unknown as React.MouseEvent);
                }
              }}
              aria-disabled={syncing}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-border bg-background hover:bg-accent",
                syncing && "opacity-50 pointer-events-none",
              )}
            >
              {syncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {syncing ? "Syncing…" : "Sync now"}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {app === "listing_studio" ? (
            <CmaFilterEditor
              connectionId={connectionId}
              onSaved={onSaved}
            />
          ) : (
            <HlFilterEditor
              connectionId={connectionId}
              onSaved={onSaved}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CMA filter editor (past-client filter)
// ---------------------------------------------------------------------------

function CmaFilterEditor({
  connectionId,
  onSaved,
}: {
  connectionId: string;
  onSaved: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [source, setSource] = useState<"stage" | "tag" | "all">("stage");
  const [value, setValue] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busy, setBusy] = useState(false);

  // Lazy-load existing filter — the parent only ships used_by chips,
  // not filter_config. Pull it once when the panel first expands.
  useEffect(() => {
    if (loadedOnce) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/apps/listing-studio/crm-connections?_=${connectionId}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (res.ok) {
          const hit = (data.connections as Array<{
            connection: { id: string };
            state: { filter_config: CmaCrmFilterConfig };
          }>).find((c) => c.connection.id === connectionId);
          if (hit?.state.filter_config) {
            setSource(hit.state.filter_config.past_client_source ?? "stage");
            setValue(hit.state.filter_config.past_client_value ?? "");
          }
        }
      } finally {
        setLoadedOnce(true);
      }
    })();
  }, [connectionId, loadedOnce]);

  const handleSave = async () => {
    setBusy(true);
    try {
      const filter_config: CmaCrmFilterConfig = {
        past_client_source: source,
        past_client_value: source === "all" ? null : value.trim() || null,
      };
      const res = await fetch(
        `/api/profile/integrations/crm-connections/${connectionId}/state/listing_studio`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter_config }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      addToast({ title: "Filter saved" });
      await onSaved();
    } catch (e) {
      addToast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "stage" | "tag" | "all")
            }
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
          >
            <option value="stage">Pipeline stage</option>
            <option value="tag">Tag</option>
            <option value="all">All contacts</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
            {source === "stage" ? "Stage value" : source === "tag" ? "Tag value" : "Value"}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={source === "all"}
            placeholder={
              source === "stage" ? "Closed" : source === "tag" ? "Past Client" : "n/a"
            }
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {source === "stage" &&
          "Only contacts whose CRM stage matches this value enroll in the CMA cadence."}
        {source === "tag" &&
          "Only contacts tagged with this value enroll."}
        {source === "all" &&
          "Every contact with a stored address enrolls. Use carefully — most CRMs have non-clients."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hyperlocal filter editor (search-area filter)
// ---------------------------------------------------------------------------

function HlFilterEditor({
  connectionId,
  onSaved,
}: {
  connectionId: string;
  onSaved: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [source, setSource] = useState<"field" | "tag-pattern" | "none">("none");
  const [column, setColumn] = useState("");
  const [tagPattern, setTagPattern] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loadedOnce) return;
    void (async () => {
      try {
        const res = await fetch("/api/apps/hyperlocal/crm-connections", {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          const hit = (data.connections as Array<{
            connection: { id: string };
            state: { filter_config: HlCrmFilterConfig };
          }>).find((c) => c.connection.id === connectionId);
          if (hit?.state.filter_config) {
            setSource(hit.state.filter_config.search_area_source ?? "none");
            setColumn(hit.state.filter_config.search_area_column ?? "");
            setTagPattern(hit.state.filter_config.search_area_tag_pattern ?? "");
          }
        }
      } finally {
        setLoadedOnce(true);
      }
    })();
  }, [connectionId, loadedOnce]);

  const handleSave = async () => {
    setBusy(true);
    try {
      const filter_config: HlCrmFilterConfig = {
        search_area_source: source,
        search_area_column: source === "field" ? column.trim() || null : null,
        search_area_tag_pattern:
          source === "tag-pattern" ? tagPattern.trim() || null : null,
      };
      const res = await fetch(
        `/api/profile/integrations/crm-connections/${connectionId}/state/hyperlocal`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter_config }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      addToast({ title: "Filter saved" });
      await onSaved();
    } catch (e) {
      addToast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "field" | "tag-pattern" | "none")
            }
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="none">No filter</option>
            <option value="field">Custom field</option>
            <option value="tag-pattern">Tag pattern</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
            {source === "field"
              ? "Field name"
              : source === "tag-pattern"
                ? "Tag pattern (e.g. looking-in-*)"
                : "Value"}
          </label>
          <input
            type="text"
            value={source === "field" ? column : tagPattern}
            onChange={(e) =>
              source === "field"
                ? setColumn(e.target.value)
                : setTagPattern(e.target.value)
            }
            disabled={source === "none"}
            placeholder={
              source === "field"
                ? "search_areas"
                : source === "tag-pattern"
                  ? "looking-in-*"
                  : "n/a"
            }
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {source === "none" &&
          "No search-area filter — every contact is eligible for any campaign segment."}
        {source === "field" &&
          "Read each contact's search-area list from this custom-field column."}
        {source === "tag-pattern" &&
          "Match tags against this wildcard pattern; the matched group becomes the search area."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect-new modal
// ---------------------------------------------------------------------------

function ConnectModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  // Multi-app connect — one platform_crm_connection serves any subset
  // of apps. Each selected app gets its own filter_config section.
  const [platform, setPlatform] = useState<CrmPlatform>("followupboss");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  // App selection — CMA default on (most common entry point).
  const [appsSelected, setAppsSelected] = useState<Record<AppSlug, boolean>>({
    listing_studio: true,
    hyperlocal: false,
  });
  // CMA filter
  const [pastClientSource, setPastClientSource] = useState<
    "stage" | "tag" | "all"
  >("stage");
  const [pastClientValue, setPastClientValue] = useState("Closed");
  // Hyperlocal filter
  const [searchAreaSource, setSearchAreaSource] = useState<
    "field" | "tag-pattern" | "none"
  >("none");
  const [searchAreaColumn, setSearchAreaColumn] = useState("");
  const [searchAreaTagPattern, setSearchAreaTagPattern] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which platforms each app supports — narrow the dropdown to the
  // intersection of all selected apps so the agent can't pick a
  // platform that won't work for one of them.
  const availablePlatforms = useMemo<CrmPlatform[]>(() => {
    const sels = (Object.keys(appsSelected) as AppSlug[]).filter(
      (k) => appsSelected[k],
    );
    if (sels.length === 0) return CMA_PLATFORMS;
    let result: CrmPlatform[] = sels.includes("hyperlocal")
      ? HL_PLATFORMS
      : CMA_PLATFORMS;
    for (const a of sels) {
      const allowed = a === "hyperlocal" ? HL_PLATFORMS : CMA_PLATFORMS;
      result = result.filter((p) => allowed.includes(p));
    }
    return result.length > 0 ? result : CMA_PLATFORMS;
  }, [appsSelected]);

  // Drop the chosen platform back to the first valid one if it falls
  // out of the intersection (e.g. user added Hyperlocal and the CMA-
  // only CSV option disappears).
  useEffect(() => {
    if (!availablePlatforms.includes(platform)) {
      setPlatform(availablePlatforms[0] ?? "followupboss");
    }
  }, [availablePlatforms, platform]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    const selectedApps = (Object.keys(appsSelected) as AppSlug[]).filter(
      (k) => appsSelected[k],
    );
    if (selectedApps.length === 0) {
      setError("Pick at least one app to wire this connection into.");
      return;
    }
    setSubmitting(true);
    try {
      const apps = selectedApps.map((a) => {
        if (a === "listing_studio") {
          return {
            app: a,
            filter_config: {
              past_client_source: pastClientSource,
              past_client_value:
                pastClientSource === "all" ? null : pastClientValue.trim(),
            },
          };
        }
        return {
          app: a,
          filter_config: {
            search_area_source: searchAreaSource,
            search_area_column:
              searchAreaSource === "field" ? searchAreaColumn.trim() : null,
            search_area_tag_pattern:
              searchAreaSource === "tag-pattern"
                ? searchAreaTagPattern.trim()
                : null,
          },
        };
      });

      const res = await fetch("/api/profile/integrations/crm-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          label: label.trim() || null,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || null,
          apps,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleApp = (a: AppSlug) =>
    setAppsSelected((prev) => ({ ...prev, [a]: !prev[a] }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold">Connect CRM</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          One CRM connection can power any number of apps. Pick which
          apps should use it; each app gets its own filter config below.
        </p>

        <div className="mt-5 space-y-4">
          <FormField label="Wire this CRM into">
            <div className="space-y-2">
              <AppCheckbox
                label={APP_LABELS.listing_studio}
                description="CMA pulls past clients on the agent's cadence"
                checked={appsSelected.listing_studio}
                onChange={() => toggleApp("listing_studio")}
              />
              <AppCheckbox
                label={APP_LABELS.hyperlocal}
                description="Hyperlocal builds campaign segments from contacts"
                checked={appsSelected.hyperlocal}
                onChange={() => toggleApp("hyperlocal")}
              />
            </div>
          </FormField>
          <FormField label="Platform">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as CrmPlatform)}
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            >
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>
                  {CRM_PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Label (optional)">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main team account"
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          <FormField label="API key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your CRM API key"
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          {(platform === "lofty" ||
            platform === "sierra" ||
            platform === "boldtrail") && (
            <FormField label="Custom base URL (optional)">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              />
            </FormField>
          )}

          {appsSelected.listing_studio && (
            <fieldset className="rounded-md border border-border bg-background/30 p-3 space-y-3">
              <legend className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
                {APP_LABELS.listing_studio} filter
              </legend>
              <FormField label="Past-client filter">
                <select
                  value={pastClientSource}
                  onChange={(e) =>
                    setPastClientSource(
                      e.target.value as "stage" | "tag" | "all",
                    )
                  }
                  className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
                >
                  <option value="stage">Pipeline stage</option>
                  <option value="tag">Tag</option>
                  <option value="all">All contacts</option>
                </select>
              </FormField>
              {pastClientSource !== "all" && (
                <FormField
                  label={
                    pastClientSource === "stage" ? "Stage value" : "Tag value"
                  }
                >
                  <input
                    type="text"
                    value={pastClientValue}
                    onChange={(e) => setPastClientValue(e.target.value)}
                    placeholder={
                      pastClientSource === "stage" ? "Closed" : "Past Client"
                    }
                    className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
                  />
                </FormField>
              )}
            </fieldset>
          )}
          {appsSelected.hyperlocal && (
            <fieldset className="rounded-md border border-border bg-background/30 p-3 space-y-3">
              <legend className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
                {APP_LABELS.hyperlocal} filter
              </legend>
              <FormField label="Search-area filter">
                <select
                  value={searchAreaSource}
                  onChange={(e) =>
                    setSearchAreaSource(
                      e.target.value as "field" | "tag-pattern" | "none",
                    )
                  }
                  className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="none">No filter</option>
                  <option value="field">Custom field</option>
                  <option value="tag-pattern">Tag pattern</option>
                </select>
              </FormField>
              {searchAreaSource === "field" && (
                <FormField label="Field name">
                  <input
                    type="text"
                    value={searchAreaColumn}
                    onChange={(e) => setSearchAreaColumn(e.target.value)}
                    placeholder="search_areas"
                    className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </FormField>
              )}
              {searchAreaSource === "tag-pattern" && (
                <FormField label="Tag pattern">
                  <input
                    type="text"
                    value={searchAreaTagPattern}
                    onChange={(e) => setSearchAreaTagPattern(e.target.value)}
                    placeholder="looking-in-*"
                    className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </FormField>
              )}
            </fieldset>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-4 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50",
            )}
            style={{
              background:
                "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Connect
          </button>
        </div>
      </form>
    </div>
  );
}

function AppCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer rounded-md border px-3 py-2 transition-colors",
        checked
          ? "border-[#D4A35C]/60 bg-[#D4A35C]/5"
          : "border-border hover:bg-accent",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
