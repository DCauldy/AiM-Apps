"use client";

import { useState } from "react";
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  PlugZap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  CmaCrmConnection,
  CmaCrmPlatform,
  CmaCrmSyncResponse,
  PastClientSource,
} from "@/types/cma";

type CrmConn = Omit<
  CmaCrmConnection,
  | "api_key_encrypted"
  | "oauth_access_token_encrypted"
  | "oauth_refresh_token_encrypted"
>;

const PLATFORM_LABELS: Record<CmaCrmPlatform, string> = {
  followupboss: "Follow Up Boss",
  lofty: "Lofty",
  sierra: "Sierra Interactive",
  boldtrail: "BoldTrail (kvCORE)",
};

const SOURCE_LABELS: Record<PastClientSource, string> = {
  stage: "Pipeline stage",
  tag: "Tag",
  all: "All contacts",
};

export function CrmTab({
  initialConnections,
}: {
  initialConnections: CrmConn[];
}) {
  const { addToast } = useToast();
  const [connections, setConnections] = useState(initialConnections);
  const [modal, setModal] = useState<
    | { kind: "new" }
    | { kind: "edit"; connection: CrmConn }
    | null
  >(null);

  const refreshList = async () => {
    try {
      const res = await fetch("/api/apps/listing-studio/crm-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setConnections(data.connections as CrmConn[]);
    } catch {
      // Soft-fail — the on-card actions update local state directly.
    }
  };

  const handleSaved = (updated: CrmConn) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  };

  const handleDelete = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">CRM connections</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Connect the CRM where your past clients live. The CMA app
            pulls contacts matching your filter (stage = &ldquo;Closed&rdquo;
            or a tag like &ldquo;Past Client&rdquo;) and shortlists
            anyone with a stored property address.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ kind: "new" })}
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
          style={{
            background:
              "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Connect CRM
        </button>
      </div>

      {connections.length === 0 ? (
        <EmptyState onConnect={() => setModal({ kind: "new" })} />
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              onEdit={() => setModal({ kind: "edit", connection: c })}
              onAfterAction={refreshList}
              onDeleted={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}

      {modal?.kind === "new" && (
        <ConnectionFormModal
          onClose={() => setModal(null)}
          onSaved={(conn) => {
            handleSaved(conn);
            setModal(null);
            addToast({ title: "CRM connected" });
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <ConnectionFormModal
          existing={modal.connection}
          onClose={() => setModal(null)}
          onSaved={(conn) => {
            handleSaved(conn);
            setModal(null);
            addToast({ title: "Saved" });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <PlugZap className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No CRM connected yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Connect Follow Up Boss, Lofty, Sierra, or BoldTrail to start
        pulling past clients into the CMA cadence.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
        }}
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

function ConnectionCard({
  connection,
  onEdit,
  onAfterAction,
  onDeleted,
}: {
  connection: CrmConn;
  onEdit: () => void;
  onAfterAction: () => Promise<void> | void;
  onDeleted: () => void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"test" | "sync" | "delete" | null>(null);
  const [testResult, setTestResult] = useState<
    | { ok: true; sampleAddress?: string; total?: number }
    | { ok: false; error: string }
    | null
  >(null);
  const [syncResult, setSyncResult] = useState<CmaCrmSyncResponse | null>(null);

  const handleTest = async () => {
    setBusy("test");
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/crm-connections/${connection.id}/test`,
        { method: "POST" },
      );
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          sampleAddress: data.sample?.address,
          total: data.contact_count_estimate,
        });
      } else {
        setTestResult({ ok: false, error: data.error ?? "Test failed" });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setBusy(null);
      await onAfterAction();
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    setSyncResult(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/crm-connections/${connection.id}/sync`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        addToast({
          title: "Sync failed",
          description: data?.error,
          variant: "destructive",
        });
        return;
      }
      setSyncResult(data as CmaCrmSyncResponse);
      addToast({
        title: "Sync complete",
        description: `${data.candidates_total} candidates, ${data.candidates_created} new, ${data.candidates_updated} updated`,
      });
    } finally {
      setBusy(null);
      await onAfterAction();
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Disconnect ${PLATFORM_LABELS[connection.platform]}? Clients pulled from this CRM stay, but won't re-sync.`,
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(
        `/api/apps/listing-studio/crm-connections/${connection.id}`,
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

  const filterDescription = (() => {
    if (!connection.past_client_source) return "No filter set";
    if (connection.past_client_source === "all") return "All contacts";
    const label = SOURCE_LABELS[connection.past_client_source];
    return `${label}: ${connection.past_client_value ?? "—"}`;
  })();

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
          <Database className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              {PLATFORM_LABELS[connection.platform]}
            </h3>
            {connection.label && (
              <span className="text-xs text-muted-foreground">
                · {connection.label}
              </span>
            )}
            {!connection.is_active && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-500/40 text-amber-400 bg-amber-500/5">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
            <div>{filterDescription}</div>
            <div>
              Last synced:{" "}
              {connection.last_synced_at
                ? new Date(connection.last_synced_at).toLocaleString()
                : "never"}
            </div>
            {connection.last_error && (
              <div className="text-rose-400">
                Last error: {connection.last_error}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <CardBtn
            onClick={handleTest}
            disabled={busy !== null}
            busy={busy === "test"}
            Icon={CheckCircle2}
          >
            Test
          </CardBtn>
          <CardBtn
            onClick={handleSync}
            disabled={busy !== null}
            busy={busy === "sync"}
            Icon={RefreshCw}
          >
            Sync
          </CardBtn>
          <CardBtn
            onClick={onEdit}
            disabled={busy !== null}
            busy={false}
            Icon={Pencil}
          >
            Edit
          </CardBtn>
          <CardBtn
            onClick={handleDelete}
            disabled={busy !== null}
            busy={busy === "delete"}
            Icon={Trash2}
            danger
          >
            Delete
          </CardBtn>
        </div>
      </div>

      {testResult && (
        <div
          className={cn(
            "mt-4 rounded-md border px-3 py-2 text-xs",
            testResult.ok
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/5 text-rose-300",
          )}
        >
          {testResult.ok ? (
            <>
              <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
              Connection works.
              {testResult.total !== undefined && (
                <> {testResult.total.toLocaleString()} total contacts in this CRM.</>
              )}
              {testResult.sampleAddress && (
                <> Sample address: {testResult.sampleAddress}.</>
              )}
            </>
          ) : (
            <>
              <XCircle className="inline h-3.5 w-3.5 mr-1" />
              {testResult.error}
            </>
          )}
        </div>
      )}

      {syncResult && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <div className="font-medium text-foreground">
            {syncResult.candidates_total.toLocaleString()} candidates matched
          </div>
          <div className="text-muted-foreground">
            {syncResult.candidates_created} new ·{" "}
            {syncResult.candidates_updated} refreshed
          </div>
          {syncResult.preview.length > 0 && (
            <div className="text-muted-foreground">
              First few: {syncResult.preview.slice(0, 3).map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
              {syncResult.preview.length > 3 && "…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardBtn({
  onClick,
  disabled,
  busy,
  Icon,
  children,
  danger,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50",
        danger
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border bg-background hover:bg-accent",
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Connection form modal (new + edit)
// ---------------------------------------------------------------------------

function ConnectionFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: CrmConn;
  onClose: () => void;
  onSaved: (conn: CrmConn) => void;
}) {
  const [platform, setPlatform] = useState<CmaCrmPlatform>(
    existing?.platform ?? "followupboss",
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? "");
  const [pastClientSource, setPastClientSource] = useState<PastClientSource>(
    existing?.past_client_source ?? "stage",
  );
  const [pastClientValue, setPastClientValue] = useState(
    existing?.past_client_value ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!existing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (
      (pastClientSource === "tag" || pastClientSource === "stage") &&
      !pastClientValue.trim()
    ) {
      setError(`A ${pastClientSource} value is required.`);
      return;
    }
    if (!isEdit && !apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        label: label.trim() || null,
        base_url: baseUrl.trim() || null,
        past_client_source: pastClientSource,
        past_client_value:
          pastClientSource === "all" ? null : pastClientValue.trim(),
      };
      if (!isEdit) body.platform = platform;
      // Re-paste the API key on edit only when user actually typed one.
      if (apiKey.trim()) body.api_key = apiKey.trim();

      const url = isEdit
        ? `/api/apps/listing-studio/crm-connections/${existing.id}`
        : "/api/apps/listing-studio/crm-connections";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      onSaved(data.connection as CrmConn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold">
          {isEdit ? "Edit CRM connection" : "Connect CRM"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {isEdit
            ? "Leave the API key blank to keep the stored one."
            : "Drop in the API key from your CRM's developer settings."}
        </p>

        <div className="mt-5 space-y-4">
          {!isEdit && (
            <FormField label="Platform">
              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value as CmaCrmPlatform)
                }
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              >
                {(Object.keys(PLATFORM_LABELS) as CmaCrmPlatform[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ),
                )}
              </select>
            </FormField>
          )}
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
              placeholder={isEdit ? "Leave blank to keep current" : "Paste your CRM API key"}
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          {platform === "lofty" || platform === "sierra" || platform === "boldtrail" ? (
            <FormField label="Custom base URL (optional)">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              />
            </FormField>
          ) : null}
          <FormField label="Past-client filter">
            <select
              value={pastClientSource}
              onChange={(e) =>
                setPastClientSource(e.target.value as PastClientSource)
              }
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            >
              <option value="stage">Pipeline stage</option>
              <option value="tag">Tag</option>
              <option value="all">All contacts (no filter)</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {pastClientSource === "stage" &&
                "We'll only pull contacts whose CRM stage matches the value below (e.g. \"Closed\")."}
              {pastClientSource === "tag" &&
                "We'll pull contacts tagged with the value below (e.g. \"Past Client\")."}
              {pastClientSource === "all" &&
                "Every contact with a property address gets enrolled. Use carefully — most CRMs have contacts who never closed."}
            </p>
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
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-4 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save" : "Connect"}
          </button>
        </div>
      </form>
    </div>
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
