"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import { UpgradeTab } from "@/components/listing-studio/settings/UpgradeTab";

type Tab = "upgrade";

const TABS: { id: Tab; label: string }[] = [{ id: "upgrade", label: "Upgrade" }];

export function SettingsClient({
  activePackId,
  hasSubscription,
}: {
  activePackId: string | null;
  hasSubscription: boolean;
}) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "upgrade";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.find((t) => t.id === initialTab) ? initialTab : "upgrade",
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Subscription, defaults, and brand identity.
          </p>
        </div>

        <ProfileFieldsBanner what="Identity, brokerage, brand colors, license info, and legal disclaimer" />

        {/* Tab nav — single tab in v1; preserves the shape so future
            Defaults / Integrations tabs slot in cleanly. */}
        <div className="border-b border-border mb-6 -mx-4 sm:mx-0 overflow-x-auto">
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
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D4A35C] rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "upgrade" && (
          <UpgradeTab
            activePackId={activePackId}
            hasSubscription={hasSubscription}
          />
        )}
      </div>
    </div>
  );
}
