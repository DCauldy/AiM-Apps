"use client";

import { useState } from "react";
import {
  Mail,
  Plus,
  Trash2,
  Star,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Copy,
  Send,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { CmaEmailConnection, CmaEmailProvider } from "@/types/cma";

type EspConn = Omit<
  CmaEmailConnection,
  | "resend_api_key_encrypted"
  | "resend_webhook_secret_encrypted"
  | "provider_api_key_encrypted"
  | "provider_oauth_access_token_encrypted"
  | "provider_oauth_refresh_token_encrypted"
>;

interface DnsRecord {
  type?: string;
  name?: string;
  value?: string;
  priority?: number;
  ttl?: string | number;
}

const PROVIDER_LABELS: Record<CmaEmailProvider, string> = {
  resend: "Resend",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  constantcontact: "Constant Contact",
  klaviyo: "Klaviyo",
};

export function EspTab({
  initialConnections,
}: {
  initialConnections: EspConn[];
}) {
  const { addToast } = useToast();
  const [connections, setConnections] = useState(initialConnections);
  const [setupKind, setSetupKind] = useState<"resend" | "sendgrid" | null>(null);

  const refreshList = async () => {
    try {
      const res = await fetch("/api/apps/listing-studio/email-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setConnections(data.connections as EspConn[]);
    } catch {
      // No-op — card actions update local state.
    }
  };

  const onSetupComplete = (conn: EspConn) => {
    setSetupKind(null);
    setConnections((prev) => [conn, ...prev]);
    addToast({ title: "Email connection added" });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Email connections</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            CMAs send through your verified Resend or SendGrid domain.
            One connection per profile is marked default; the cadence
            scheduler uses that one for every send.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSetupKind("resend")}
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
            style={{
              background:
                "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Resend
          </button>
          <button
            type="button"
            onClick={() => setSetupKind("sendgrid")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add SendGrid
          </button>
        </div>
      </div>

      {connections.length === 0 ? (
        <EmptyState onAddResend={() => setSetupKind("resend")} />
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              onAfterAction={refreshList}
              onDeleted={() =>
                setConnections((prev) => prev.filter((x) => x.id !== c.id))
              }
              onSetDefault={(updated) =>
                setConnections((prev) =>
                  prev.map((x) =>
                    x.id === updated.id
                      ? updated
                      : { ...x, is_default: false },
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      {setupKind === "resend" && (
        <ResendSetupModal
          onClose={() => setSetupKind(null)}
          onSaved={onSetupComplete}
        />
      )}
      {setupKind === "sendgrid" && (
        <SendgridSetupModal
          onClose={() => setSetupKind(null)}
          onSaved={onSetupComplete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAddResend }: { onAddResend: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
        <Send className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No sending connection yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Connect Resend (recommended) or SendGrid to send your CMA
        emails from your own verified domain. BYO API key —
        deliverability + reputation stay with you.
      </p>
      <button
        type="button"
        onClick={onAddResend}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
        }}
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

function ConnectionCard({
  connection,
  onAfterAction,
  onDeleted,
  onSetDefault,
}: {
  connection: EspConn;
  onAfterAction: () => Promise<void> | void;
  onDeleted: () => void;
  onSetDefault: (updated: EspConn) => void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"default" | "delete" | "check" | null>(null);

  const handleSetDefault = async () => {
    setBusy("default");
    try {
      const res = await fetch(
        `/api/apps/listing-studio/email-connections/${connection.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_default: true }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        addToast({
          title: "Update failed",
          description: data?.error,
          variant: "destructive",
        });
        return;
      }
      onSetDefault(data.connection as EspConn);
      addToast({ title: "Default updated" });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Disconnect ${connection.email_address}? Deliveries already sent stay; future cadence sends will need another connection set as default.`,
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(
        `/api/apps/listing-studio/email-connections/${connection.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
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

  // Resend-only: re-poll domain status without re-running verify.
  const handleCheckDomain = async () => {
    setBusy("check");
    try {
      const res = await fetch(
        `/api/apps/listing-studio/email-connections/resend/check-domain?connection_id=${connection.id}`,
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
        title: data.status === "verified" ? "Domain verified" : "Still pending",
      });
      await onAfterAction();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
          <Mail className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              {PROVIDER_LABELS[connection.provider]}
            </h3>
            <span className="text-xs text-muted-foreground">
              {connection.email_address}
            </span>
            {connection.is_default && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#D4A35C]/40 text-[#D4A35C] bg-[#D4A35C]/5">
                <Star className="h-2.5 w-2.5 fill-current" />
                Default
              </span>
            )}
            <DkimBadge status={connection.resend_dkim_status} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
            {connection.resend_domain && (
              <div>Domain: {connection.resend_domain}</div>
            )}
            <div>
              Last send:{" "}
              {connection.last_send_at
                ? new Date(connection.last_send_at).toLocaleString()
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
          {connection.provider === "resend" && (
            <CardBtn
              onClick={handleCheckDomain}
              disabled={busy !== null}
              busy={busy === "check"}
              Icon={CheckCircle2}
            >
              Re-check
            </CardBtn>
          )}
          {!connection.is_default && (
            <CardBtn
              onClick={handleSetDefault}
              disabled={busy !== null || !connection.is_active}
              busy={busy === "default"}
              Icon={Star}
            >
              Set default
            </CardBtn>
          )}
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
// Resend setup modal
// ---------------------------------------------------------------------------

function ResendSetupModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (conn: EspConn) => void;
}) {
  return (
    <ProviderSetupModal
      title="Connect Resend"
      apiKeyHelper="Get your API key from resend.com → API Keys"
      apiKeyPrefix="re_"
      endpoint="/api/apps/listing-studio/email-connections/resend/verify-domain"
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function SendgridSetupModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (conn: EspConn) => void;
}) {
  return (
    <ProviderSetupModal
      title="Connect SendGrid"
      apiKeyHelper="Get your API key from app.sendgrid.com → Settings → API Keys (Full Access)"
      apiKeyPrefix="SG."
      endpoint="/api/apps/listing-studio/email-connections/sendgrid/verify-domain"
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

interface VerifyDomainResponse {
  connection: EspConn;
  dns_records?: DnsRecord[];
  status?: string;
  webhook_error?: string | null;
}

function ProviderSetupModal({
  title,
  apiKeyHelper,
  apiKeyPrefix,
  endpoint,
  onClose,
  onSaved,
}: {
  title: string;
  apiKeyHelper: string;
  apiKeyPrefix: string;
  endpoint: string;
  onClose: () => void;
  onSaved: (conn: EspConn) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [domain, setDomain] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyDomainResponse | null>(null);

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
      const res = await fetch(endpoint, {
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

  // After verification: show DNS records the user must add. The card
  // they'll see in the list reflects DKIM status; they can come back
  // and click "Re-check" to refresh once DNS propagates.
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
            Verification can take 1-10 minutes once they&apos;re live —
            we&apos;ll re-check every time you open this connection card.
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
              Domain is already verified on this account — nothing to add.
            </div>
          )}

          {verified.webhook_error && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Webhook setup skipped: {verified.webhook_error}. Engagement
                events won&apos;t track until you re-provision. Set
                NEXT_PUBLIC_APP_URL or re-run setup from a production
                URL.
              </span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onSaved(verified.connection)}
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
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{apiKeyHelper}</p>

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
  const copy = (value: string) => {
    navigator.clipboard.writeText(value).then(
      () => addToast({ title: "Copied" }),
      () => addToast({ title: "Copy failed", variant: "destructive" }),
    );
  };
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
        <div className="flex flex-col gap-1">
          {record.value && (
            <button
              type="button"
              onClick={() => copy(record.value!)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium font-sans hover:bg-accent"
              title="Copy value"
            >
              <Copy className="h-2.5 w-2.5" />
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
