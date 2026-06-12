"use client";

import { useState, useEffect, useCallback } from "react";

import { ProductHeader } from "@/components/app-shell/ProductHeader";
import { ListingStudioUpgradeModal } from "@/components/listing-studio/ListingStudioUpgradeModal";
import { UNLIMITED } from "@/lib/listing-studio-packs";
import { cn } from "@/lib/utils";

type ListingStudioUsageStatus = {
  activeClients: number;
  activeClientsLimit: number;
  activeClientsRemaining: number | "unlimited";
  deliveriesSent: number;
  manualSends: number;
  manualSendsLimit: number;
  tier: string;
  periodStart: string;
  periodEnd: string;
  nudge: boolean;
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/cma/dashboard" },
  { label: "Clients", href: "/apps/cma/clients" },
  { label: "Settings", href: "/apps/cma/settings" },
];

function isListingStudioActive(href: string, pathname: string | null) {
  if (href === "/apps/cma/dashboard") {
    return (
      pathname === "/apps/cma/dashboard" ||
      pathname === "/apps/cma" ||
      Boolean(pathname?.startsWith("/apps/cma/dashboard"))
    );
  }
  if (href === "/apps/cma/clients") {
    return Boolean(pathname?.startsWith("/apps/cma/clients"));
  }
  return Boolean(pathname?.startsWith(href));
}

export function ListingStudioHeader() {
  const [usage, setUsage] = useState<ListingStudioUsageStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchUsage = useCallback(() => {
    fetch("/api/apps/listing-studio/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usage) setUsage(data.usage);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsage();
    // Fired by other components after a listing is promoted so the chip
    // refreshes without a full page reload (e.g., promote-prospect flow).
    window.addEventListener("listing-studio-usage-updated", fetchUsage);
    return () =>
      window.removeEventListener("listing-studio-usage-updated", fetchUsage);
  }, [fetchUsage]);

  // Unlimited (-1 from DB / UNLIMITED sentinel) renders as "∞" and
  // never triggers a limit/nudge state. Diamond tier sits here.
  const isUnlimited = usage?.activeClientsLimit === UNLIMITED;
  const limitReached =
    !!usage && !isUnlimited && usage.activeClientsRemaining === 0;
  const isNudge = !!usage && !isUnlimited && usage.nudge;

  return (
    <>
      <ProductHeader
        homeHref="/apps/cma/dashboard"
        navItems={NAV_ITEMS}
        isActive={isListingStudioActive}
        accentClassName="text-[#D4A35C]"
        activeIndicatorClassName="bg-[#D4A35C] shadow-[0_0_6px_rgba(212,163,92,0.5)]"
        mobileActiveClassName="text-[#D4A35C] bg-[#D4A35C]/10"
        desktopRightSlot={
          usage && (
            <button
              type="button"
              onClick={() => {
                if (limitReached || isNudge) {
                  setShowUpgradeModal(true);
                }
              }}
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                limitReached
                  ? "border-destructive/40 text-destructive cursor-pointer hover:bg-destructive/5"
                  : isNudge
                    ? "border-amber-500/40 text-amber-400 cursor-pointer hover:bg-amber-500/5"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] cursor-default",
              )}
            >
              {limitReached ? (
                <>
                  <span>Limit reached</span>
                  <span className="text-destructive">— Upgrade</span>
                </>
              ) : isNudge ? (
                <>
                  <span>
                    {usage.activeClientsRemaining === "unlimited"
                      ? ""
                      : `${usage.activeClientsRemaining} left`}
                  </span>
                  <span className="text-amber-500">— Upgrade</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">
                    {usage.activeClients}
                  </span>
                  <span>/</span>
                  <span>{isUnlimited ? "∞" : usage.activeClientsLimit}</span>
                  <span>clients</span>
                </>
              )}
            </button>
          )
        }
        mobileExtraSlot={
          usage && (
            <div className="pt-2 border-t border-[hsl(var(--border))]">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                  isNudge
                    ? "border-amber-500/40 text-amber-400"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
                )}
              >
                <span className="font-semibold text-foreground">
                  {usage.activeClients}
                </span>
                <span>/</span>
                <span>{isUnlimited ? "∞" : usage.activeClientsLimit}</span>
                <span>clients enrolled</span>
              </span>
            </div>
          )
        }
      />
      <ListingStudioUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={limitReached ? "limit" : "cta"}
        periodEnd={usage?.periodEnd}
        currentUsage={
          usage
            ? {
                activeClients: usage.activeClients,
                activeClientsLimit: isUnlimited
                  ? 9999
                  : usage.activeClientsLimit,
              }
            : undefined
        }
      />
    </>
  );
}
