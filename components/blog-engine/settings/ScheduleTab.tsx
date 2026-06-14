"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { BofuSchedule, DayOfWeek } from "@/types/blog-engine";

const DAYS_OF_WEEK: { key: DayOfWeek; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export function ScheduleTab({
  initialSchedule,
}: {
  initialSchedule: BofuSchedule | null;
}) {
  const { addToast } = useToast();
  const [schedule, setSchedule] = useState(
    initialSchedule || {
      frequency: 3,
      active_days: ["monday", "wednesday", "friday"] as DayOfWeek[],
      preferred_time: "08:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      is_active: true,
    },
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/apps/blog-engine/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (res.ok) {
        addToast({
          title: "Schedule saved",
          description: "Your next blog will publish on the new cadence.",
        });
      } else {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Save failed",
          description: data.error || "Could not save schedule",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <Field label="Blogs per week">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
            <span className="text-sm font-medium text-foreground">
              {schedule.frequency}× per week
            </span>
            <span className="text-xs text-muted-foreground">
              (manage tier on the Upgrade tab)
            </span>
          </div>
        </Field>

        <Field label="Active days">
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.key}
                onClick={() => {
                  const active = schedule.active_days.includes(day.key);
                  setSchedule({
                    ...schedule,
                    active_days: active
                      ? schedule.active_days.filter((d) => d !== day.key)
                      : [...schedule.active_days, day.key],
                  });
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  schedule.active_days.includes(day.key)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Preferred time">
          <input
            type="time"
            value={schedule.preferred_time}
            onChange={(e) =>
              setSchedule({ ...schedule, preferred_time: e.target.value })
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Timezone">
          <input
            type="text"
            value={schedule.timezone}
            onChange={(e) =>
              setSchedule({ ...schedule, timezone: e.target.value })
            }
            placeholder="America/New_York"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save schedule
        </button>
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
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
