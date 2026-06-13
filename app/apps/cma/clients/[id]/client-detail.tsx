"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  Home,
  CalendarClock,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  Send,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import type { CmaClient, CmaClientDelivery } from "@/types/cma";

const DEFAULT_CADENCE_DAYS = 90;
const MIN_CADENCE_DAYS = 7;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function clientName(c: CmaClient): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || c.email || "Unknown client";
}

function statusOf(c: CmaClient): { label: string; cls: string } {
  if (c.unsubscribed_at)
    return { label: "Unsubscribed", cls: "text-rose-400 border-rose-500/40 bg-rose-500/5" };
  if (c.paused)
    return { label: "Paused", cls: "text-amber-400 border-amber-500/40 bg-amber-500/5" };
  if (c.enrolled)
    return { label: "Enrolled", cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5" };
  return { label: "Pending review", cls: "text-muted-foreground border-border bg-card" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClientDetail({
  initialClient,
  initialDeliveries,
}: {
  initialClient: CmaClient;
  initialDeliveries: CmaClientDelivery[];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [client, setClient] = useState<CmaClient>(initialClient);
  const deliveries = initialDeliveries; // Wave 3: server-rendered snapshot is fine
  const [saving, setSaving] = useState<string | null>(null);

  const status = statusOf(client);

  const patch = async (body: Record<string, unknown>, busyKey: string) => {
    setSaving(busyKey);
    try {
      const res = await fetch(`/api/apps/listing-studio/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        // 402 = active-client cap reached; surface the specific message
        const msg =
          data?.error ?? `Update failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      setClient(data.client as CmaClient);
      addToast({ title: "Saved" });
    } catch (e) {
      addToast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${clientName(client)}?`,
      description:
        "This removes the row entirely — it does NOT honor as an unsubscribe.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setSaving("delete");
    try {
      const res = await fetch(`/api/apps/listing-studio/clients/${client.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? `Delete failed (HTTP ${res.status})`);
      }
      addToast({ title: "Client deleted" });
      router.push("/apps/cma/clients");
      router.refresh();
    } catch (e) {
      addToast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setSaving(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-5">
        <Link
          href="/apps/cma/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>

        {/* Header */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {clientName(client)}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
                    status.cls,
                  )}
                >
                  {status.label}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  {client.address ?? "—"}
                </span>
                {client.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {client.email}
                  </span>
                )}
                {client.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {client.phone}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 items-end">
              <EnrollmentControls
                client={client}
                busyKey={saving}
                onEnroll={() => patch({ enrolled: true }, "enroll")}
                onUnenroll={() => patch({ enrolled: false }, "enroll")}
                onPause={() => patch({ paused: true }, "pause")}
                onResume={() => patch({ paused: false }, "pause")}
              />
              <SendNowButton
                clientId={client.id}
                disabled={!!client.unsubscribed_at || !client.email || !client.address}
              />
            </div>
          </div>
        </div>

        {/* Engagement banner — surfaces bounce / complaint on the most
            recent delivery so the agent acts (fix the address, drop
            the client) before the next cadence cycle. */}
        <EngagementBanner deliveries={deliveries} />

        {/* Cadence + meta panel */}
        <CadencePanel
          client={client}
          busy={saving === "cadence"}
          onSave={(cadence) => patch({ cadence_days: cadence }, "cadence")}
        />

        {/* Delivery history */}
        <DeliveryHistory deliveries={deliveries} clientEnrolled={client.enrolled} />

        {/* Address edit */}
        <AddressEdit
          client={client}
          busy={saving === "address"}
          onSave={(address) => patch({ address }, "address")}
        />

        {/* Danger zone */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Delete client</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Removes the row entirely. Does NOT add the client to a
                suppression list — they could re-appear on the next CRM sync.
                Use the email&apos;s unsubscribe link for permanent opt-out.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving === "delete"}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              {saving === "delete" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EngagementBanner({
  deliveries,
}: {
  deliveries: CmaClientDelivery[];
}) {
  // Walk the deliveries (newest-first) until we hit a sent one — that's
  // the canonical "last delivery." Anything in front of it is a pending
  // / failed row we shouldn't gate UX on.
  const lastSent = deliveries.find((d) => d.delivered_at !== null);
  if (!lastSent) return null;
  if (lastSent.complained_at) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 text-rose-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-rose-300">
              Spam complaint on last delivery
            </div>
            <div className="text-xs text-rose-200/80 mt-0.5">
              This client marked your last CMA as spam. We&apos;ve
              auto-unsubscribed them per CAN-SPAM. Re-enrolling without
              their permission would damage your sending reputation.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (lastSent.bounced_at) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-300">
              Last delivery bounced
            </div>
            <div className="text-xs text-amber-200/80 mt-0.5">
              The address or email failed at the recipient&apos;s mail
              server. Confirm the email is current — re-running the
              cadence at the same address will bounce again and
              hurt deliverability.
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function SendNowButton({
  clientId,
  disabled,
}: {
  clientId: string;
  disabled: boolean;
}) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    const ok = await confirm({
      title: "Send a fresh CMA right now?",
      description: "Uses one of your monthly manual sends.",
      confirmLabel: "Send now",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/clients/${clientId}/send-now`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Send failed (HTTP ${res.status})`);
      }
      addToast({
        title: "Delivery queued",
        description: `${data.manual_sends_this_month}${
          data.manual_sends_limit === -1
            ? ""
            : ` / ${data.manual_sends_limit}`
        } manual sends this month`,
      });
    } catch (e) {
      addToast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || busy}
      title={
        disabled
          ? "Add an address + email before sending"
          : "Send a CMA off-cadence"
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Send now
    </button>
  );
}

function EnrollmentControls({
  client,
  busyKey,
  onEnroll,
  onUnenroll,
  onPause,
  onResume,
}: {
  client: CmaClient;
  busyKey: string | null;
  onEnroll: () => void;
  onUnenroll: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const enrollBusy = busyKey === "enroll";
  const pauseBusy = busyKey === "pause";

  if (client.unsubscribed_at) {
    return (
      <div className="text-xs text-muted-foreground">
        Unsubscribed {formatDate(client.unsubscribed_at)}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {client.enrolled ? (
        <>
          {client.paused ? (
            <button
              type="button"
              onClick={onResume}
              disabled={pauseBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {pauseBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Resume cadence
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              disabled={pauseBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {pauseBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={onUnenroll}
            disabled={enrollBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {enrollBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Unenroll
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onEnroll}
          disabled={enrollBusy}
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-3 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)" }}
        >
          {enrollBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Enroll in cadence
        </button>
      )}
    </div>
  );
}

function CadencePanel({
  client,
  busy,
  onSave,
}: {
  client: CmaClient;
  busy: boolean;
  onSave: (cadence: number | null) => void;
}) {
  const [cadence, setCadence] = useState<string>(
    client.cadence_days?.toString() ?? "",
  );

  const cadenceNum = cadence.trim() === "" ? null : Number(cadence);
  const dirty = cadenceNum !== client.cadence_days;
  const invalid =
    cadenceNum !== null && (!Number.isFinite(cadenceNum) || cadenceNum < MIN_CADENCE_DAYS);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-[#D4A35C]" />
        Cadence
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        How often this client gets a fresh CMA. Leave blank to use your
        account default (currently {DEFAULT_CADENCE_DAYS} days). Minimum {MIN_CADENCE_DAYS} days.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Days between sends
          </label>
          <input
            type="number"
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            min={MIN_CADENCE_DAYS}
            placeholder={String(DEFAULT_CADENCE_DAYS)}
            className="mt-1 block w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Next due:</span>{" "}
            {client.next_due_at ? formatDate(client.next_due_at) : "—"}
          </div>
          <div className="mt-0.5">
            <span className="font-medium text-foreground">Last sent:</span>{" "}
            {client.last_delivered_at ? formatDate(client.last_delivered_at) : "never"}
            {client.delivered_count > 0 && ` (${client.delivered_count} total)`}
          </div>
        </div>
        <button
          type="button"
          disabled={!dirty || invalid || busy}
          onClick={() => onSave(cadenceNum)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

function AddressEdit({
  client,
  busy,
  onSave,
}: {
  client: CmaClient;
  busy: boolean;
  onSave: (address: string) => void;
}) {
  const [value, setValue] = useState(client.address ?? "");
  const dirty = value.trim() !== (client.address ?? "");

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Home className="h-4 w-4 text-[#D4A35C]" />
        Property address
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        The address the CMA runs against. Editing wipes the cached
        property facts (zpid, lat/lon, image) — next CMA re-resolves
        them from scratch.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[260px]">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Address
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="1234 Main St, City, State 12345"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
          />
        </div>
        <button
          type="button"
          disabled={!dirty || !value.trim() || busy}
          onClick={() => onSave(value.trim())}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

function DeliveryHistory({
  deliveries,
  clientEnrolled,
}: {
  deliveries: CmaClientDelivery[];
  clientEnrolled: boolean;
}) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
        <Send className="mx-auto mb-2 h-4 w-4" />
        No CMAs delivered yet.{" "}
        {clientEnrolled
          ? "First send goes out on the next cadence tick."
          : "Enroll this client to start the cadence."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-[#D4A35C]" />
          Delivery history
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {deliveries.map((d) => (
          <li key={d.id} className="px-5 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  {d.delivered_at
                    ? formatDate(d.delivered_at)
                    : d.send_error
                      ? "Failed"
                      : "Pending"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {d.email_subject ?? "(no subject)"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {d.recommended_price_cents != null && (
                  <div>
                    ${Math.round(d.recommended_price_cents / 100).toLocaleString()}
                  </div>
                )}
                {d.opened_at && (
                  <div className="text-sky-400">
                    Opened {d.opened_count}×
                  </div>
                )}
                {d.clicked_at && (
                  <div className="text-emerald-400">
                    Clicked {d.clicked_count}×
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
