"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CrmTab } from "@/components/hyperlocal/settings/CrmTab";
import { EmailTab } from "@/components/hyperlocal/settings/EmailTab";
import { SuppressionTab } from "@/components/hyperlocal/settings/SuppressionTab";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import type {
  PlatformSenderProfile,
  PlatformBrandingProfile,
  HlCrmConnection,
  HlEmailConnection,
  HlSuppression,
} from "@/types/hyperlocal";

type Tab = "crm" | "email" | "suppression";

const TABS: { id: Tab; label: string }[] = [
  { id: "crm", label: "CRMs" },
  { id: "email", label: "Email" },
  { id: "suppression", label: "Suppression" },
];

export function SettingsClient({
  crmConnections,
  emailConnections,
  suppressions,
}: {
  /** Accepted for backwards compatibility — sender + branding now live on /apps/profile. */
  senderProfiles?: PlatformSenderProfile[];
  brandingProfiles?: PlatformBrandingProfile[];
  crmConnections: HlCrmConnection[];
  emailConnections: HlEmailConnection[];
  suppressions: HlSuppression[];
}) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "crm";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.find((t) => t.id === initialTab) ? initialTab : "crm"
  );

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connected CRMs, email accounts, and global suppression list.
        </p>
      </div>

      <ProfileFieldsBanner what="Sender identity, brokerage, and brand visuals" />

      {/* Tab nav */}
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
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#F43F5E] rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "crm" && <CrmTab initialConnections={crmConnections} />}
      {activeTab === "email" && (
        <EmailTab initialConnections={emailConnections} />
      )}
      {activeTab === "suppression" && (
        <SuppressionTab initialSuppressions={suppressions} />
      )}
    </div>
  );
}
