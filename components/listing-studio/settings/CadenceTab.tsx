"use client";

import { useState } from "react";
import { CalendarClock, Loader2, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { CmaAgentSettings } from "@/types/cma";

const MIN_CADENCE_DAYS = 7;
const MAX_REMINDER_LEAD_DAYS = 30;

export function CadenceTab({
  initialSettings,
}: {
  initialSettings: CmaAgentSettings;
}) {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<CmaAgentSettings>(initialSettings);
  const [draft, setDraft] = useState({
    default_cadence_days: String(initialSettings.default_cadence_days),
    reminder_lead_days: String(initialSettings.reminder_lead_days),
    manual_review_required: initialSettings.manual_review_required,
  });
  const [saving, setSaving] = useState(false);

  const cadenceNum = Number(draft.default_cadence_days);
  const reminderNum = Number(draft.reminder_lead_days);

  const cadenceInvalid =
    !Number.isFinite(cadenceNum) || cadenceNum < MIN_CADENCE_DAYS;
  const reminderInvalid =
    !Number.isFinite(reminderNum) ||
    reminderNum < 0 ||
    reminderNum > MAX_REMINDER_LEAD_DAYS;

  const dirty =
    cadenceNum !== settings.default_cadence_days ||
    reminderNum !== settings.reminder_lead_days ||
    draft.manual_review_required !== settings.manual_review_required;

  const handleSave = async () => {
    if (cadenceInvalid || reminderInvalid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/apps/listing-studio/agent-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_cadence_days: cadenceNum,
          reminder_lead_days: reminderNum,
          manual_review_required: draft.manual_review_required,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error ?? `Save failed (HTTP ${res.status})`);
      setSettings(data.settings as CmaAgentSettings);
      addToast({ title: "Cadence saved" });
    } catch (e) {
      addToast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Default cadence */}
      <Panel
        Icon={CalendarClock}
        title="Default cadence"
        description="How often a client receives a fresh CMA. Per-client overrides on the client detail page take precedence over this default."
      >
        <Field label="Days between sends">
          <input
            type="number"
            min={MIN_CADENCE_DAYS}
            value={draft.default_cadence_days}
            onChange={(e) =>
              setDraft((d) => ({ ...d, default_cadence_days: e.target.value }))
            }
            className={cn(
              "block w-32 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1",
              cadenceInvalid
                ? "border-destructive/40 focus:ring-destructive/40"
                : "border-border focus:ring-[#D4A35C]/40",
            )}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Minimum {MIN_CADENCE_DAYS} days. Quarterly (90) is the
            industry-standard touch frequency.
          </p>
        </Field>
      </Panel>

      {/* Pre-send reminder */}
      <Panel
        Icon={CalendarClock}
        title="Pre-send reminder"
        description="Number of days before a cadence send that we surface the upcoming delivery on your dashboard. Set to 0 to skip the reminder entirely."
      >
        <Field label="Reminder lead time (days)">
          <input
            type="number"
            min={0}
            max={MAX_REMINDER_LEAD_DAYS}
            value={draft.reminder_lead_days}
            onChange={(e) =>
              setDraft((d) => ({ ...d, reminder_lead_days: e.target.value }))
            }
            className={cn(
              "block w-32 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1",
              reminderInvalid
                ? "border-destructive/40 focus:ring-destructive/40"
                : "border-border focus:ring-[#D4A35C]/40",
            )}
          />
        </Field>
      </Panel>

      {/* Manual review gate */}
      <Panel
        Icon={ShieldCheck}
        title="Manual review before send"
        description="When enabled, the cadence scheduler stages each delivery as a draft and waits for your explicit approval. Useful for hands-on agents or as a kill-switch during onboarding."
      >
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={draft.manual_review_required}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                manual_review_required: e.target.checked,
              }))
            }
            className="h-4 w-4 cursor-pointer rounded border-border"
          />
          <span className="text-sm group-hover:text-foreground">
            Require manual approval for every cadence send
          </span>
        </label>
      </Panel>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={!dirty || cadenceInvalid || reminderInvalid || saving}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-4 py-2 transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save cadence
        </button>
      </div>
    </div>
  );
}

function Panel({
  Icon,
  title,
  description,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
