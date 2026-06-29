"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";

import { cn } from "@/lib/utils";
import { SuppressionTab } from "@/components/hyperlocal/settings/SuppressionTab";
import { HistoryTab } from "@/components/hyperlocal/settings/HistoryTab";
import { UpgradeTab } from "@/components/hyperlocal/settings/UpgradeTab";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import type { HlSuppression } from "@/types/hyperlocal";

type Tab = "history" | "suppression" | "upgrade";

const TABS: { id: Tab; label: string }[] = [
  { id: "history", label: "Historical data" },
  { id: "suppression", label: "Suppression" },
  { id: "upgrade", label: "Upgrade" },
];

export function SettingsClient({
  suppressions,
  activePackId,
  hasSubscription,
  profileId,
}: {
  suppressions: HlSuppression[];
  activePackId: string | null;
  hasSubscription: boolean;
  /** Drives the "Manage integrations" deep-link. Null = no active
   *  profile yet; callout points at /apps/profile/new instead. */
  profileId: string | null;
}) {
  const searchParams = useSearchParams();
  // Wave 12: ?tab=crm / ?tab=email aliases redirect to History (the
  // new default). Connection management moved to the profile editor.
  const initial = searchParams.get("tab");
  const aliasRedirect = initial === "crm" || initial === "email";
  const resolvedInitial: Tab =
    !aliasRedirect && TABS.find((t) => t.id === (initial as Tab))
      ? (initial as Tab)
      : "history";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedInitial);

  const integrationsHref = profileId
    ? `/apps/profile/${profileId}?tab=crm`
    : "/apps/profile/new";

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historical data, suppression list, and your Hyperlocal pack.
          CRM + email connections live on your profile so every app
          shares them.
        </p>
      </div>

      <ProfileFieldsBanner what="Sender identity, brokerage, and brand visuals" />

      {/* Integrations callout — points at the profile-level CRM tab.
          Replaces the old CRM + Email tabs that lived here. */}
      <Link
        href={integrationsHref}
        className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card hover:bg-accent px-4 py-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F43F5E]/10 text-[#F43F5E]">
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
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#F43F5E] rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "history" && <HistoryTab />}
      {activeTab === "suppression" && (
        <SuppressionTab initialSuppressions={suppressions} />
      )}
      {activeTab === "upgrade" && (
        <UpgradeTab
          activePackId={activePackId}
          hasSubscription={hasSubscription}
        />
      )}
    </div>
  );
}
