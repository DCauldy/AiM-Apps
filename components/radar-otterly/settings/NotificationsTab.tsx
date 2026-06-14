"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Mail } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

// Per-customer email preferences for Radar. Two toggles drive the
// radar-daily-alerts and radar-weekly-digest Trigger.dev cron tasks.

interface NotificationPrefs {
  alerts_enabled: boolean;
  digest_enabled: boolean;
  last_alert_sent_at: string | null;
  last_digest_sent_at: string | null;
}

export function NotificationsTab() {
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
                prefs[t.key] ? "bg-[#e0a458]" : "bg-muted",
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
