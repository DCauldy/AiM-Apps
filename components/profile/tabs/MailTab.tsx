"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail as MailIcon,
  Loader2,
  Plus,
  Trash2,
  Star,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  PlayCircle,
  AlertCircle,
  PlugZap,
  Send,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type {
  AppSlug,
  PlatformEmailConnectionPublic,
} from "@/types/platform-connections";

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

interface AppStateSummary {
  app: AppSlug;
  state_id: string;
  is_default: boolean;
  paused: boolean;
  last_send_at: string | null;
  last_error: string | null;
}

interface EmailConnEntry {
  connection: PlatformEmailConnectionPublic;
  used_by: AppStateSummary[];
}

const APP_LABELS: Record<AppSlug, string> = {
  hyperlocal: "Hyperlocal",
  listing_studio: "CMA",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function ProfileMailTab() {
  const { addToast } = useToast();
  const [conns, setConns] = useState<EmailConnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupKind, setSetupKind] =
    useState<{ app: AppSlug; provider: "resend" | "sendgrid" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/integrations/email-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setConns(data.connections as EmailConnEntry[]);
    } catch (e) {
      addToast({
        title: "Couldn't load email connections",
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
          <h2 className="text-base font-semibold">Email connections</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            BYO verified domain. Both apps (CMA + Hyperlocal) can send
            from the same Resend or SendGrid setup; each one keeps its
            own default + webhook subscription.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              setSetupKind({ app: "listing_studio", provider: "resend" })
            }
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Resend
          </button>
          <button
            type="button"
            onClick={() =>
              setSetupKind({ app: "listing_studio", provider: "sendgrid" })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add SendGrid
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : conns.length === 0 ? (
        <EmptyState
          onAddResend={() =>
            setSetupKind({ app: "listing_studio", provider: "resend" })
          }
        />
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

      {setupKind && (
        <SetupModal
          app={setupKind.app}
          provider={setupKind.provider}
          onClose={() => setSetupKind(null)}
          onSaved={() => {
            setSetupKind(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onAddResend }: { onAddResend: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <Send className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No sending connection yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Verify a Resend (recommended) or SendGrid domain. Deliverability
        + reputation stay with you.
      </p>
      <button
        type="button"
        onClick={onAddResend}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)" }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Resend connection
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
  entry: EmailConnEntry;
  onDeleted: () => void;
  onReload: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const c = entry.connection;

  const handleDelete = async () => {
    const usageList = entry.used_by.map((u) => APP_LABELS[u.app]).join(", ");
    if (
      !confirm(
        entry.used_by.length > 0
          ? `Disconnect ${EMAIL_PROVIDER_LABELS[c.provider]} from every app (${usageList})? Existing deliveries stay; future sends stop.`
          : `Delete this ${EMAIL_PROVIDER_LABELS[c.provider]} connection?`,
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(
        `/api/profile/integrations/email-connections/${c.id}`,
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

  const handleCheckDomain = async () => {
    setBusy("recheck");
    try {
      // Resend re-check is hosted under the CMA route since the
      // logic is the same (talks to Resend) — it doesn't care which
      // app called it. Could be hoisted to a profile route later.
      const res = await fetch(
        `/api/apps/listing-studio/email-connections/resend/check-domain?connection_id=${c.id}`,
      );
      const data = await res.json();
      if (!res.ok) {
        addToast({
          title: "Check failed",
          description: data?.error,
          variant: "destructive",
        });
        return;
      }
      addToast({
        title:
          data.status === "verified" ? "Domain verified" : "Still pending",
      });
      await onReload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-5 flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
          <MailIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              {EMAIL_PROVIDER_LABELS[c.provider]}
            </h3>
            <span className="text-xs text-muted-foreground">
              {c.email_address}
            </span>
            <DkimBadge status={c.resend_dkim_status} />
          </div>
          {c.resend_domain && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Domain: {c.resend_domain}
            </div>
          )}
          {entry.used_by.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not wired into any app yet — toggle default in the per-app
              section below once one appears.
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {c.provider === "resend" && (
            <button
              type="button"
              onClick={handleCheckDomain}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50"
            >
              {busy === "recheck" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Re-check DKIM
            </button>
          )}
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
      </div>

      {entry.used_by.length > 0 && (
        <div className="border-t border-border">
          {entry.used_by.map((u) => (
            <PerAppRow
              key={u.state_id}
              connectionId={c.id}
              state={u}
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-app row (default toggle + pause)
// ---------------------------------------------------------------------------

function PerAppRow({
  connectionId,
  state,
  onReload,
}: {
  connectionId: string;
  state: AppStateSummary;
  onReload: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"default" | "pause" | null>(null);

  const patchState = async (
    body: { is_default?: boolean; paused?: boolean; paused_reason?: string | null; paused_at?: string | null },
    busyKey: "default" | "pause",
  ) => {
    setBusy(busyKey);
    try {
      const res = await fetch(
        `/api/profile/integrations/email-connections/${connectionId}/state/${state.app}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      await onReload();
    } catch (e) {
      addToast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-5 py-3 border-b border-border last:border-b-0 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-foreground">
          {APP_LABELS[state.app]}
        </span>
        {state.is_default && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#D4A35C]/40 text-[#D4A35C] bg-[#D4A35C]/5">
            <Star className="h-2.5 w-2.5 fill-current" />
            Default
          </span>
        )}
        {state.paused && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-500/40 text-amber-400 bg-amber-500/5">
            Paused
          </span>
        )}
        {state.last_send_at && (
          <span className="text-[11px] text-muted-foreground">
            · last send {new Date(state.last_send_at).toLocaleDateString()}
          </span>
        )}
        {state.last_error && (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
            <AlertCircle className="h-3 w-3" />
            {state.last_error.slice(0, 60)}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {!state.is_default && (
          <button
            type="button"
            onClick={() => patchState({ is_default: true }, "default")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50"
          >
            {busy === "default" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Star className="h-3 w-3" />
            )}
            Set default
          </button>
        )}
        {state.paused ? (
          <button
            type="button"
            onClick={() =>
              patchState(
                { paused: false, paused_reason: null, paused_at: null },
                "pause",
              )
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50"
          >
            {busy === "pause" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              patchState(
                {
                  paused: true,
                  paused_reason: "manually paused",
                  paused_at: new Date().toISOString(),
                },
                "pause",
              )
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {busy === "pause" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PauseCircle className="h-3 w-3" />
            )}
            Pause
          </button>
        )}
      </div>
    </div>
  );
}

function DkimBadge({
  status,
}: {
  status: "pending" | "verified" | "failed" | null | undefined;
}) {
  if (!status) return null;
  const map = {
    verified: {
      Icon: CheckCircle2,
      cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
    },
    pending: {
      Icon: Clock,
      cls: "text-amber-400 border-amber-500/40 bg-amber-500/5",
    },
    failed: {
      Icon: XCircle,
      cls: "text-rose-400 border-rose-500/40 bg-rose-500/5",
    },
  } as const;
  const { Icon, cls } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
        cls,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      DKIM {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Setup modal (Resend / SendGrid verify-domain)
// ---------------------------------------------------------------------------

interface DnsRecord {
  type?: string;
  name?: string;
  value?: string;
  priority?: number;
}

interface VerifyDomainResponse {
  dns_records?: DnsRecord[];
  status?: string;
  webhook_error?: string | null;
}

function SetupModal({
  app,
  provider,
  onClose,
  onSaved,
}: {
  app: AppSlug;
  provider: "resend" | "sendgrid";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [domain, setDomain] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyDomainResponse | null>(null);

  const apiKeyPrefix = provider === "resend" ? "re_" : "SG.";
  const verifyEndpoint =
    app === "listing_studio"
      ? `/api/apps/listing-studio/email-connections/${provider}/verify-domain`
      : `/api/apps/hyperlocal/email-connections/${provider}/verify-domain`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!apiKey.startsWith(apiKeyPrefix)) {
      setError(`API key should start with '${apiKeyPrefix}'.`);
      return;
    }
    if (!fromEmail.endsWith(`@${domain.toLowerCase()}`)) {
      setError("From email must be on the verified domain.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey.trim(),
          domain: domain.trim().toLowerCase(),
          from_email: fromEmail.trim().toLowerCase(),
          display_name: displayName.trim() || null,
        }),
      });
      const data = (await res.json()) as VerifyDomainResponse | { error: string };
      if (!res.ok) {
        setError(
          "error" in data ? data.error : `Request failed (${res.status})`,
        );
        return;
      }
      setVerified(data as VerifyDomainResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  if (verified) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <h2 className="text-base font-semibold">Almost there</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Add these DNS records to your domain&apos;s registrar.
            Verification can take 1–10 minutes once they&apos;re live.
            Re-check from the connection card after DNS propagates.
          </p>

          {verified.dns_records && verified.dns_records.length > 0 ? (
            <div className="mt-5 space-y-2">
              {verified.dns_records.map((rec, i) => (
                <DnsRecordRow key={i} record={rec} />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
              Domain already verified — nothing to add.
            </div>
          )}

          {verified.webhook_error && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Webhook setup skipped: {verified.webhook_error}. Engagement
                events won&apos;t track until you re-provision.
              </span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onSaved()}
              className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-4 py-1.5 transition-opacity hover:opacity-90"
              style={{
                background:
                  "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          Connect {provider === "resend" ? "Resend" : "SendGrid"} for{" "}
          {APP_LABELS[app]}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {provider === "resend"
            ? "Get your API key from resend.com → API Keys"
            : "Get your API key from app.sendgrid.com → Settings → API Keys (Full Access)"}
        </p>

        <div className="mt-5 space-y-4">
          <FormField label="API key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyPrefix + "…"}
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          <FormField label="Sending domain">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mail.yourdomain.com"
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          <FormField label="From email">
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={domain ? `you@${domain}` : "you@mail.yourdomain.com"}
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
          <FormField label="Display name (optional)">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe Realty"
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </FormField>
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
            Verify domain
          </button>
        </div>
      </form>
    </div>
  );
}

function DnsRecordRow({ record }: { record: DnsRecord }) {
  const { addToast } = useToast();
  const copy = (value: string) =>
    navigator.clipboard.writeText(value).then(
      () => addToast({ title: "Copied" }),
      () => addToast({ title: "Copy failed", variant: "destructive" }),
    );
  return (
    <div className="rounded-md border border-border bg-background/50 p-3 font-mono text-xs">
      <div className="grid grid-cols-[60px_1fr_auto] gap-2 items-start">
        <span className="text-muted-foreground uppercase font-sans font-medium">
          {record.type ?? "TXT"}
        </span>
        <div className="space-y-1 break-all">
          <div>
            <span className="text-muted-foreground font-sans">name:</span>{" "}
            <span className="text-foreground">{record.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground font-sans">value:</span>{" "}
            <span className="text-foreground">{record.value}</span>
          </div>
          {record.priority !== undefined && (
            <div>
              <span className="text-muted-foreground font-sans">priority:</span>{" "}
              <span className="text-foreground">{record.priority}</span>
            </div>
          )}
        </div>
        <div>
          {record.value && (
            <button
              type="button"
              onClick={() => copy(record.value!)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium font-sans hover:bg-accent"
              title="Copy value"
            >
              Copy
            </button>
          )}
        </div>
      </div>
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
