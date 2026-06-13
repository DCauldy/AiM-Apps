"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock, PlugZap, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import { UpgradeTab } from "@/components/listing-studio/settings/UpgradeTab";
import { CadenceTab } from "@/components/listing-studio/settings/CadenceTab";
import type { CmaAgentSettings } from "@/types/cma";

type Tab = "cadence" | "upgrade";

const TABS: {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "cadence", label: "Cadence", Icon: CalendarClock },
  { id: "upgrade", label: "Upgrade", Icon: Zap },
];

export function SettingsClient({
  activePackId,
  hasSubscription,
  agentSettings,
  profileId,
}: {
  activePackId: string | null;
  hasSubscription: boolean;
  agentSettings: CmaAgentSettings;
  /** When set, the "Manage integrations" CTA deep-links into the
   *  active profile's CRM tab. Null when the user has no active
   *  profile yet (they'll get bounced to /apps/profile/new). */
  profileId: string | null;
}) {
  const searchParams = useSearchParams();
  // Wave 12: ?tab=integrations / ?tab=crm / ?tab=esp aliases redirect
  // out to the profile editor — connection management lives there
  // now, not in CMA settings.
  const initial = searchParams.get("tab");
  const integrationsAlias =
    initial === "integrations" || initial === "crm" || initial === "esp";
  const resolvedInitial: Tab =
    !integrationsAlias && TABS.find((t) => t.id === (initial as Tab))
      ? (initial as Tab)
      : "cadence";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedInitial);

  const integrationsHref = profileId
    ? `/apps/profile/${profileId}?tab=crm`
    : "/apps/profile/new";

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadence defaults and your CMA pack. CRM + email connections
            now live on your profile so every app shares them.
          </p>
        </div>

        <ProfileFieldsBanner what="Identity, brokerage, brand colors, license info, and legal disclaimer" />

        {/* Integrations callout — points at the profile-level CRM tab.
            Replaces the old CRM + ESP tabs that lived here in Wave 6. */}
        <Link
          href={integrationsHref}
          className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card hover:bg-accent px-4 py-3 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C]">
              <PlugZap className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-medium">Manage integrations</div>
              <div className="text-xs text-muted-foreground">
                CRM connections + email senders live on your profile
              </div>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Open profile →</span>
        </Link>

        <div className="border-b border-border my-6 -mx-4 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-4 sm:px-0">
            {TABS.map((tab) => {
              const Icon = tab.Icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D4A35C] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {activeTab === "cadence" && (
          <CadenceTab initialSettings={agentSettings} />
        )}
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
