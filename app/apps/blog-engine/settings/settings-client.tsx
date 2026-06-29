"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import { ScheduleTab } from "@/components/blog-engine/settings/ScheduleTab";
import { PublishingTab } from "@/components/blog-engine/settings/PublishingTab";
import { ToneCtasTab } from "@/components/blog-engine/settings/ToneCtasTab";
import { UpgradeTab } from "@/components/blog-engine/settings/UpgradeTab";
import type {
  BofuProfile,
  BofuSchedule,
  BofuCmsConnection,
} from "@/types/blog-engine";

interface SettingsClientProps {
  profile: BofuProfile;
  schedule: BofuSchedule | null;
  cmsConnections: BofuCmsConnection[];
  hasSubscription: boolean;
}

type Tab = "schedule" | "publishing" | "tone" | "upgrade";

const TABS: { id: Tab; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "publishing", label: "Publishing" },
  { id: "tone", label: "Tone & CTAs" },
  { id: "upgrade", label: "Upgrade" },
];

export function SettingsClient({
  profile,
  schedule,
  cmsConnections,
  hasSubscription,
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "schedule";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.find((t) => t.id === initialTab) ? initialTab : "schedule",
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="font-sans text-xl font-bold text-foreground">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Blog schedule, publishing destinations, tone, and your subscription.
          </p>
        </div>

        <ProfileFieldsBanner what="Identity, brokerage, market, target clients, brand colors, and legal disclaimer" />

        {/* Tab nav — matches Hyperlocal pattern, brand accent swapped */}
        <div className="border-b border-border -mx-6 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-6 sm:px-0">
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
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#31DBA5] rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "schedule" && (
          <ScheduleTab initialSchedule={schedule} />
        )}
        {activeTab === "publishing" && (
          <PublishingTab initialConnections={cmsConnections} />
        )}
        {activeTab === "tone" && <ToneCtasTab initialProfile={profile} />}
        {activeTab === "upgrade" && (
          <UpgradeTab
            frequency={schedule?.frequency ?? 3}
            hasSubscription={hasSubscription}
          />
        )}
      </div>
    </div>
  );
}
