"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

/** Only show these keys on the App Availability tab, with friendly
 *  labels + fallback descriptions. Keep in sync with
 *  lib/feature-flags.ts FEATURES — every app the user can launch
 *  should be toggleable here. */
const APP_FLAGS: Record<string, { label: string; description: string }> = {
  PROMPT_STUDIO: {
    label: "Prompt Studio",
    description: "AI-powered prompt engineering for AiM members.",
  },
  BLOG_ENGINE: {
    label: "Blog Engine",
    description:
      "Automated BOFU blog generation with WordPress / Squarespace publishing.",
  },
  RADAR: {
    label: "Radar",
    description:
      "AI search visibility monitoring across ChatGPT, Perplexity, and Google AI Overviews.",
  },
  HYPERLOCAL: {
    label: "Hyperlocal",
    description:
      "Neighborhood market-report email campaigns sent through the user's own ESP.",
  },
  LISTING_STUDIO: {
    label: "Listing Studio",
    description:
      "Per-listing CMA + 6 marketing outputs (description, photo ordering/captions, DOTW + HTML emails). Nationwide via RapidAPI.",
  },
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

      const label = APP_FLAGS[key]?.label ?? key;
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

  // Render one row per KNOWN app flag, not per existing DB row.
  // Missing rows render as off — toggling them upserts a new row
  // via PATCH (already supported by the API). Prevents new apps
  // from being invisible in admin until someone seeds the DB.
  const settingsByKey = new Map(settings.map((s) => [s.key, s]));
  const rows = Object.entries(APP_FLAGS).map(([key, meta]) => {
    const existing = settingsByKey.get(key);
    return {
      key,
      value: existing?.value ?? "false",
      // Prefer the DB row's description if set, otherwise fall back to
      // the static one in APP_FLAGS so newly-added apps still show
      // meaningful copy before they have a settings row.
      description: existing?.description ?? meta.description,
      isNew: !existing,
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        Toggle apps on or off. Changes take effect immediately for server-side checks.
      </p>

      {rows.map((setting) => (
        <div
          key={setting.key}
          className="flex items-center justify-between p-4 border rounded-lg"
        >
          <div>
            <p className="font-medium">
              {APP_FLAGS[setting.key]?.label ?? setting.key}
              {setting.isNew && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  not yet configured
                </span>
              )}
            </p>
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
