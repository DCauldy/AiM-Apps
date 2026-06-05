"use client";

import { useState, useEffect, useCallback } from "react";

import { ProductHeader } from "@/components/app-shell/ProductHeader";
import { ProductHelpButton } from "@/components/app-shell/ProductHelpButton";
import { RadarHelpModal } from "@/components/radar/RadarHelpModal";
import { RadarUpgradeModal } from "@/components/radar/RadarUpgradeModal";
import { cn } from "@/lib/utils";

type RadarUsageBadge = {
  queriesUsed: number;
  queryLimit: number;
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/radar/dashboard" },
  { label: "Monitor", href: "/apps/radar/monitor" },
  { label: "Research", href: "/apps/radar/research" },
  { label: "Optimize", href: "/apps/radar/optimize" },
  { label: "Settings", href: "/apps/radar/settings" },
];

function isRadarActive(href: string, pathname: string | null) {
  if (href === "/apps/radar/dashboard") {
    return pathname === "/apps/radar/dashboard" || pathname === "/apps/radar";
  }
  return Boolean(pathname?.startsWith(href));
}

export function RadarHeader() {
  const [usage, setUsage] = useState<RadarUsageBadge | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const fetchUsage = useCallback(() => {
    fetch("/api/apps/radar/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usage) {
          setUsage({
            queriesUsed: data.usage.queriesUsed,
            queryLimit: data.usage.queryLimit,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsage();
    window.addEventListener("radar-usage-updated", fetchUsage);
    return () => window.removeEventListener("radar-usage-updated", fetchUsage);
  }, [fetchUsage]);

  const usageLimitReached = usage ? usage.queriesUsed >= usage.queryLimit : false;

  return (
    <>
      <ProductHeader
        homeHref="/apps/radar/dashboard"
        navItems={NAV_ITEMS}
        isActive={isRadarActive}
        accentClassName="text-[#e0a458]"
        activeIndicatorClassName="bg-[#e0a458] shadow-[0_0_6px_rgba(224,164,88,0.5)]"
        mobileActiveClassName="text-[#e0a458] bg-[#e0a458]/10"
        desktopRightSlot={
          <>
            {usage && (
              <button
                type="button"
                onClick={() => {
                  if (usageLimitReached) {
                    setShowUpgradeModal(true);
                  }
                }}
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  usageLimitReached
                    ? "border-destructive/40 text-destructive cursor-pointer hover:bg-destructive/5"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] cursor-default"
                )}
              >
                <span className="font-semibold text-foreground">{usage.queriesUsed}</span>
                <span>/</span>
                <span>{usage.queryLimit}</span>
                <span>queries</span>
              </button>
            )}
            <ProductHelpButton
              title="How to use Radar"
              gradientId="helpIconGradientRadar"
              startColor="#e0a458"
              middleColor="#c88d3e"
              endColor="#1c4c8a"
              dotColor="#b07a3a"
              onClick={() => setShowHelpModal(true)}
            />
          </>
        }
        mobileExtraSlot={
          usage && (
            <div className="pt-2 border-t border-[hsl(var(--border))]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                <span className="font-semibold text-foreground">{usage.queriesUsed}</span>
                <span>/</span>
                <span>{usage.queryLimit}</span>
                <span>queries tracked</span>
              </span>
            </div>
          )
        }
      />
      <RadarUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
      <RadarHelpModal open={showHelpModal} onOpenChange={setShowHelpModal} />
    </>
  );
}
