"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

/** Only show these keys on the App Availability tab, with friendly labels */
const APP_FLAGS: Record<string, string> = {
  PROMPT_STUDIO: "Prompt Studio",
  BLOG_ENGINE: "Blog Engine",
};

export function AppAvailabilityTab() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data: Setting[] = await res.json();
      setSettings(data);
    } catch {
      addToast({ title: "Error", description: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleSetting(key: string, currentValue: string) {
    const newValue = currentValue === "true" ? "false" : "true";
    setSaving(key);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      });

      if (!res.ok) throw new Error("Failed to update setting");

      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: newValue } : s))
      );

      const label = APP_FLAGS[key] ?? key;
      addToast({ title: `${label} ${newValue === "true" ? "enabled" : "disabled"}` });
    } catch {
      addToast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading settings...</div>;
  }

  // Filter to only app-level flags
  const appSettings = settings.filter((s) => s.key in APP_FLAGS);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        Toggle apps on or off. Changes take effect immediately for server-side checks.
      </p>

      {appSettings.map((setting) => (
        <div
          key={setting.key}
          className="flex items-center justify-between p-4 border rounded-lg"
        >
          <div>
            <p className="font-medium">{APP_FLAGS[setting.key]}</p>
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
          <button
            onClick={() => toggleSetting(setting.key, setting.value)}
            disabled={saving === setting.key}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            style={{
              backgroundColor: setting.value === "true" ? "#31DBA5" : "#d1d5db",
            }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                setting.value === "true" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
