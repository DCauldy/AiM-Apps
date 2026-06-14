"use client";

import { useState, useEffect, useCallback } from "react";

import { ProductHeader } from "@/components/app-shell/ProductHeader";
import { HyperlocalUpgradeModal } from "@/components/hyperlocal/HyperlocalUpgradeModal";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import { cn } from "@/lib/utils";

type HyperlocalUsageStatus = {
  campaignsThisMonth: number;
  campaignsLimit: number;
  campaignsRemaining: number | "unlimited";
  tier: string;
  periodStart: string;
  periodEnd: string;
  nudge: boolean;
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/hyperlocal/dashboard" },
  { label: "Campaigns", href: "/apps/hyperlocal/campaigns" },
  { label: "Settings", href: "/apps/hyperlocal/settings" },
];

function isHyperlocalActive(href: string, pathname: string | null) {
  if (href === "/apps/hyperlocal/dashboard") {
    return pathname === "/apps/hyperlocal/dashboard" || pathname === "/apps/hyperlocal";
  }
  return Boolean(pathname?.startsWith(href));
}

export function HyperlocalHeader() {
  const [usage, setUsage] = useState<HyperlocalUsageStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchUsage = useCallback(() => {
    fetch("/api/apps/hyperlocal/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usage) setUsage(data.usage);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsage();
    // Fired by other components after a new run is launched so the
    // chip refreshes without a full page reload (e.g., RunLauncher).
    window.addEventListener("hyperlocal-usage-updated", fetchUsage);
    return () =>
      window.removeEventListener("hyperlocal-usage-updated", fetchUsage);
  }, [fetchUsage]);

  // Unlimited (-1 from DB / UNLIMITED sentinel) renders as "∞" and
  // never triggers a limit/nudge state. Diamond tier sits here.
  const isUnlimited = usage?.campaignsLimit === UNLIMITED;
  const limitReached =
    !!usage && !isUnlimited && usage.campaignsRemaining === 0;
  const isNudge = !!usage && !isUnlimited && usage.nudge;

  return (
    <>
      <ProductHeader
        homeHref="/apps/hyperlocal/dashboard"
        navItems={NAV_ITEMS}
        isActive={isHyperlocalActive}
        accentClassName="text-[#F43F5E]"
        activeIndicatorClassName="bg-[#F43F5E] shadow-[0_0_6px_rgba(244,63,94,0.5)]"
        mobileActiveClassName="text-[#F43F5E] bg-[#F43F5E]/10"
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
                  <span>1 left</span>
                  <span className="text-amber-500">— Upgrade</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">
                    {usage.campaignsThisMonth}
                  </span>
                  <span>/</span>
                  <span>{isUnlimited ? "∞" : usage.campaignsLimit}</span>
                  <span>campaigns</span>
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
                  {usage.campaignsThisMonth}
                </span>
                <span>/</span>
                <span>{isUnlimited ? "∞" : usage.campaignsLimit}</span>
                <span>campaigns this month</span>
              </span>
            </div>
          )
        }
      />
      <HyperlocalUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={limitReached ? "limit" : "cta"}
        periodEnd={usage?.periodEnd}
        currentUsage={
          usage
            ? {
                campaignsThisMonth: usage.campaignsThisMonth,
                campaignsLimit: isUnlimited ? 9999 : usage.campaignsLimit,
              }
            : undefined
        }
      />
    </>
  );
}
