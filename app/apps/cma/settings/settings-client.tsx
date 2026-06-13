"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  Database,
  Mail as MailIcon,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import { UpgradeTab } from "@/components/listing-studio/settings/UpgradeTab";
import { CadenceTab } from "@/components/listing-studio/settings/CadenceTab";
import { CrmTab } from "@/components/listing-studio/settings/CrmTab";
import { EspTab } from "@/components/listing-studio/settings/EspTab";
import type { CmaAgentSettings } from "@/types/cma";
import type {
  AppCrmConnection,
  AppEmailConnection,
} from "@/types/platform-connections";

type Tab = "cadence" | "crm" | "esp" | "upgrade";

type CmaCrmConn = AppCrmConnection<"listing_studio">;
type CmaEspConn = AppEmailConnection<"listing_studio">;

const TABS: {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "cadence", label: "Cadence", Icon: CalendarClock },
  { id: "crm", label: "CRM", Icon: Database },
  { id: "esp", label: "Email", Icon: MailIcon },
  { id: "upgrade", label: "Upgrade", Icon: Zap },
];

export function SettingsClient({
  activePackId,
  hasSubscription,
  agentSettings,
  crmConnections,
  espConnections,
}: {
  activePackId: string | null;
  hasSubscription: boolean;
  agentSettings: CmaAgentSettings;
  crmConnections: CmaCrmConn[];
  espConnections: CmaEspConn[];
}) {
  const searchParams = useSearchParams();
  // ?tab=integrations alias points at the CRM tab — Wave 3's empty
  // state CTA wires onboarding flow to ?tab=integrations specifically.
  const initial = searchParams.get("tab");
  const resolvedInitial: Tab =
    initial === "integrations"
      ? "crm"
      : TABS.find((t) => t.id === (initial as Tab))
        ? (initial as Tab)
        : "cadence";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedInitial);

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadence defaults, CRM connections, email sending, and your
            CMA pack.
          </p>
        </div>

        <ProfileFieldsBanner what="Identity, brokerage, brand colors, license info, and legal disclaimer" />

        <div className="border-b border-border mb-6 -mx-4 sm:mx-0 overflow-x-auto">
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
        {activeTab === "crm" && (
          <CrmTab initialConnections={crmConnections} />
        )}
        {activeTab === "esp" && (
          <EspTab initialConnections={espConnections} />
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
