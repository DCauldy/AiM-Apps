"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

import { TABS, type SettingsResponse, type Tab } from "./settings/types";
import { GateState, SettingsSkeleton, statusTitle } from "./settings/shared";
import { TrackingTab } from "./settings/TrackingTab";
import { QuotaTab } from "./settings/QuotaTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { UpgradeTab } from "./settings/UpgradeTab";

// ============================================================
// Settings — tabbed surface matching the other apps' settings.
//
//   Tracking      → what's being tracked + customize forms.
//   Quota         → per-customer plan allocation.
//   Notifications → email alert + digest opt-in toggles.
//   Upgrade       → Bronze / Silver / Gold / Diamond pack ladder.
//
// Each tab lives in its own file under ./settings/. This shell only
// owns the fetch + tab routing.
// ============================================================

export function RadarSettingsClient() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "tracking";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.find((t) => t.id === initialTab) ? initialTab : "tracking",
  );
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/settings", {
        cache: "no-store",
      });
      const payload = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error("Failed to load Settings");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Settings",
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

  if (loading && !data) return <SettingsSkeleton />;
  if (!data) return <SettingsSkeleton />;

  if (data.status !== "ready") {
    return (
      <GateState
        title={statusTitle(data.status)}
        body={
          data.status === "otterly_error"
            ? `Couldn't load settings right now. ${data.error?.message ?? ""}`
            : "Settings will populate once tracking is set up for your active profile."
        }
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tracking config, usage quota, and your Radar subscription.
          </p>
        </div>

        <div className="border-b border-border -mx-4 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-4 sm:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#e0a458] rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "tracking" && (
          <TrackingTab
            report={data.report!}
            websiteUrl={data.websiteUrl ?? ""}
            capacity={data.capacity ?? null}
            trackedPrompts={data.trackedPrompts ?? []}
          />
        )}
        {activeTab === "quota" && <QuotaTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "upgrade" && <UpgradeTab />}
      </div>
    </div>
  );
}
