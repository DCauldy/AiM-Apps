"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Database,
  Mail as MailIcon,
  Loader2,
  Trash2,
  PlugZap,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { CRM_PLATFORM_LABELS, EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type {
  AppSlug,
  PlatformCrmConnectionPublic,
  PlatformEmailConnectionPublic,
} from "@/types/platform-connections";

// ---------------------------------------------------------------------------
// Wire formats from /api/profile/integrations/*
// ---------------------------------------------------------------------------

interface CrmAppState {
  app: AppSlug;
  state_id: string;
  last_synced_at: string | null;
  last_error: string | null;
}

interface EmailAppState {
  app: AppSlug;
  state_id: string;
  is_default: boolean;
  paused: boolean;
  last_send_at: string | null;
  last_error: string | null;
}

interface CrmConnEntry {
  connection: PlatformCrmConnectionPublic;
  used_by: CrmAppState[];
}

interface EmailConnEntry {
  connection: PlatformEmailConnectionPublic;
  used_by: EmailAppState[];
}

const APP_LABELS: Record<AppSlug, string> = {
  hyperlocal: "Hyperlocal",
  listing_studio: "CMA",
};

// "Edit filter →" link target per app — points at the app's own
// settings tab where the agent edits filter_config / app-specific
// state. Profile-level page handles auth (shared) only.
const APP_SETTINGS_URLS: Record<AppSlug, { crm: string; email: string }> = {
  hyperlocal: {
    crm: "/apps/hyperlocal/settings",
    email: "/apps/hyperlocal/settings",
  },
  listing_studio: {
    crm: "/apps/cma/settings?tab=crm",
    email: "/apps/cma/settings?tab=esp",
  },
};

type Tab = "crm" | "email";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function IntegrationsClient({
  profileName,
  hasProfile,
}: {
  profileName: string | null;
  hasProfile: boolean;
}) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("crm");
  const [crmConns, setCrmConns] = useState<CrmConnEntry[]>([]);
  const [emailConns, setEmailConns] = useState<EmailConnEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCrm = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/integrations/crm-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setCrmConns(data.connections as CrmConnEntry[]);
    } catch (e) {
      addToast({
        title: "Couldn't load CRM connections",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [addToast]);

  const loadEmail = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/integrations/email-connections", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setEmailConns(data.connections as EmailConnEntry[]);
    } catch (e) {
      addToast({
        title: "Couldn't load email connections",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [addToast]);

  useEffect(() => {
    if (!hasProfile) {
      setLoading(false);
      return;
    }
    Promise.all([loadCrm(), loadEmail()]).finally(() => setLoading(false));
  }, [hasProfile, loadCrm, loadEmail]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            CRM + email connections wire into multiple apps from one
            place. Auth lives here{profileName ? ` on ${profileName}` : ""}; each
            app keeps its own filter + send settings.
          </p>
        </div>

        {!hasProfile ? (
          <NoProfileState />
        ) : (
          <>
            <div className="border-b border-border mb-6 -mx-4 sm:mx-0 overflow-x-auto">
              <nav className="flex gap-1 px-4 sm:px-0">
                <TabButton
                  Icon={Database}
                  label="CRM"
                  count={crmConns.length}
                  isActive={activeTab === "crm"}
                  onClick={() => setActiveTab("crm")}
                />
                <TabButton
                  Icon={MailIcon}
                  label="Email"
                  count={emailConns.length}
                  isActive={activeTab === "email"}
                  onClick={() => setActiveTab("email")}
                />
              </nav>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : activeTab === "crm" ? (
              <CrmTab
                entries={crmConns}
                onDeleted={(id) =>
                  setCrmConns((prev) => prev.filter((e) => e.connection.id !== id))
                }
                onReload={loadCrm}
              />
            ) : (
              <EmailTab
                entries={emailConns}
                onDeleted={(id) =>
                  setEmailConns((prev) => prev.filter((e) => e.connection.id !== id))
                }
                onReload={loadEmail}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  Icon,
  label,
  count,
  isActive,
  onClick,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold",
          isActive ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
      {isActive && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}

function NoProfileState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PlugZap className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold">Set up a profile first</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Connections live on a profile so each brand persona owns its own
        integrations. Create your first profile, then come back.
      </p>
      <Link
        href="/apps/profile/new"
        className="mt-5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90"
        style={{ background: "var(--aim-grad)" }}
      >
        Create profile
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CRM tab
// ---------------------------------------------------------------------------

function CrmTab({
  entries,
  onDeleted,
  onReload,
}: {
  entries: CrmConnEntry[];
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  if (entries.length === 0) {
    return (
      <EmptyConnList
        title="No CRM connected on this profile yet"
        body="Hop into Hyperlocal or CMA settings to wire up your first CRM. Once it's connected, it shows up here and can be reused across apps."
        ctas={[
          { label: "Connect via Hyperlocal", href: "/apps/hyperlocal/settings" },
          { label: "Connect via CMA", href: "/apps/cma/settings?tab=crm" },
        ]}
      />
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <CrmCard
          key={entry.connection.id}
          entry={entry}
          onDeleted={onDeleted}
          onReload={onReload}
        />
      ))}
    </div>
  );
}

function CrmCard({
  entry,
  onDeleted,
  onReload,
}: {
  entry: CrmConnEntry;
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"delete" | null>(null);
  const c = entry.connection;
  const usedBy = entry.used_by;

  const handleDelete = async () => {
    const usageList = usedBy.map((u) => APP_LABELS[u.app]).join(", ");
    if (
      !confirm(
        usedBy.length > 0
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
      onDeleted(c.id);
      addToast({ title: "Disconnected" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <UsageChips kind="crm" appStates={usedBy} />
          </div>
          {usedBy.some((u) => u.last_error) && (
            <p className="mt-2 text-[11px] text-rose-400">
              {usedBy.find((u) => u.last_error)?.app
                ? `${APP_LABELS[usedBy.find((u) => u.last_error)!.app]}: ${usedBy.find((u) => u.last_error)?.last_error}`
                : null}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
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
      {usedBy.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border space-y-1">
          {usedBy.map((u) => (
            <div
              key={u.state_id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted-foreground">
                {APP_LABELS[u.app]} filter
              </span>
              <Link
                href={APP_SETTINGS_URLS[u.app].crm}
                className="text-primary hover:underline"
              >
                Edit in {APP_LABELS[u.app]} settings →
              </Link>
            </div>
          ))}
        </div>
      )}
      {/* Silence unused-var warning for onReload — used by the parent
          when reload-after-action surfaces (not wired yet, kept for
          future Edit-modal). */}
      <span className="hidden" aria-hidden onClick={() => onReload()} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email tab
// ---------------------------------------------------------------------------

function EmailTab({
  entries,
  onDeleted,
  onReload,
}: {
  entries: EmailConnEntry[];
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  if (entries.length === 0) {
    return (
      <EmptyConnList
        title="No email connection on this profile yet"
        body="Verify a Resend or SendGrid domain from Hyperlocal or CMA settings. Once it's set up, both apps can send from the same verified domain."
        ctas={[
          { label: "Verify via Hyperlocal", href: "/apps/hyperlocal/settings" },
          { label: "Verify via CMA", href: "/apps/cma/settings?tab=esp" },
        ]}
      />
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <EmailCard
          key={entry.connection.id}
          entry={entry}
          onDeleted={onDeleted}
          onReload={onReload}
        />
      ))}
    </div>
  );
}

function EmailCard({
  entry,
  onDeleted,
  onReload,
}: {
  entry: EmailConnEntry;
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"delete" | null>(null);
  const c = entry.connection;
  const usedBy = entry.used_by;

  const handleDelete = async () => {
    const usageList = usedBy.map((u) => APP_LABELS[u.app]).join(", ");
    if (
      !confirm(
        usedBy.length > 0
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
      onDeleted(c.id);
      addToast({ title: "Disconnected" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <UsageChips kind="email" appStates={usedBy} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
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
      {usedBy.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border space-y-1">
          {usedBy.map((u) => (
            <div
              key={u.state_id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted-foreground">
                {APP_LABELS[u.app]} default + send state
              </span>
              <Link
                href={APP_SETTINGS_URLS[u.app].email}
                className="text-primary hover:underline"
              >
                Manage in {APP_LABELS[u.app]} settings →
              </Link>
            </div>
          ))}
        </div>
      )}
      <span className="hidden" aria-hidden onClick={() => onReload()} />
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
// Shared subcomponents
// ---------------------------------------------------------------------------

function UsageChips({
  kind,
  appStates,
}: {
  kind: "crm" | "email";
  appStates: (CrmAppState | EmailAppState)[];
}) {
  if (appStates.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-muted text-muted-foreground">
        <AlertCircle className="h-2.5 w-2.5" />
        Not wired into any app yet
      </span>
    );
  }
  return (
    <>
      {appStates.map((s) => {
        const isEmail = kind === "email";
        const emailState = s as EmailAppState;
        const isDefault = isEmail && emailState.is_default;
        const isPaused = isEmail && emailState.paused;
        return (
          <span
            key={s.state_id}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
              isPaused
                ? "border-amber-500/40 text-amber-400 bg-amber-500/5"
                : "border-primary/40 text-primary bg-primary/5",
            )}
          >
            {isDefault && <Star className="h-2.5 w-2.5 fill-current" />}
            {APP_LABELS[s.app]}
            {isPaused && " · paused"}
          </span>
        );
      })}
    </>
  );
}

function EmptyConnList({
  title,
  body,
  ctas,
}: {
  title: string;
  body: string;
  ctas: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PlugZap className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {body}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {ctas.map((cta) => (
          <Link
            key={cta.href}
            href={cta.href}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {cta.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
