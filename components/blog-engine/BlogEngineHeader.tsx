"use client";

import { useState, useEffect, useCallback } from "react";

import { ProductHeader } from "@/components/app-shell/ProductHeader";
import { ProductHelpButton } from "@/components/app-shell/ProductHelpButton";
import { BlogEngineHelpModal } from "@/components/blog-engine/BlogEngineHelpModal";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { cn } from "@/lib/utils";

type BofuUsageStatus = {
  blogsGenerated: number;
  blogsLimit: number;
  blogsRemaining: number;
  bonusBlogs: number;
  effectiveRemaining: number;
  weekStart: string;
  weekEnd: string;
  nudge: boolean;
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/blog-engine/dashboard" },
  { label: "My Blogs", href: "/apps/blog-engine/blogs" },
  { label: "Topic Bank", href: "/apps/blog-engine/topics" },
  { label: "Settings", href: "/apps/blog-engine/settings" },
];

function isBlogEngineActive(href: string, pathname: string | null) {
  if (href === "/apps/blog-engine/dashboard") {
    return pathname === "/apps/blog-engine/dashboard" || pathname === "/apps/blog-engine";
  }
  return Boolean(pathname?.startsWith(href));
}

export function BlogEngineHeader() {
  const [usage, setUsage] = useState<BofuUsageStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const fetchUsage = useCallback(() => {
    fetch("/api/apps/blog-engine/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usage) setUsage(data.usage);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsage();
    window.addEventListener("blog-usage-updated", fetchUsage);
    return () => window.removeEventListener("blog-usage-updated", fetchUsage);
  }, [fetchUsage]);

  return (
    <>
      <ProductHeader
        homeHref="/apps/blog-engine/dashboard"
        navItems={NAV_ITEMS}
        isActive={isBlogEngineActive}
        accentClassName="text-[#31DBA5]"
        activeIndicatorClassName="bg-[#31DBA5] shadow-[0_0_6px_rgba(49,219,165,0.5)]"
        mobileActiveClassName="text-[#31DBA5] bg-[#31DBA5]/10"
        desktopRightSlot={
          <>
            {usage && (
              <button
                type="button"
                onClick={() => {
                  if (usage.effectiveRemaining <= 0 || usage.nudge) {
                    setShowUpgradeModal(true);
                  }
                }}
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  usage.effectiveRemaining <= 0
                    ? "border-destructive/40 text-destructive cursor-pointer hover:bg-destructive/5"
                    : usage.nudge
                      ? "border-amber-500/40 text-amber-400 cursor-pointer hover:bg-amber-500/5"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] cursor-default"
                )}
              >
                {usage.effectiveRemaining <= 0 ? (
                  <span>Limit reached</span>
                ) : usage.nudge ? (
                  <>
                    <span>1 left</span>
                    <span className="text-amber-500">— Upgrade</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      {usage.blogsGenerated}
                    </span>
                    <span>/</span>
                    <span>{usage.blogsLimit}</span>
                    <span>blogs</span>
                  </>
                )}
              </button>
            )}
            <ProductHelpButton
              title="How to use Blog Engine"
              gradientId="helpIconGradientBE"
              startColor="#31DBA5"
              middleColor="#25B88A"
              endColor="#1C4C8A"
              dotColor="#317196"
              onClick={() => setShowHelpModal(true)}
            />
          </>
        }
        mobileExtraSlot={
          usage && (
            <div className="pt-2 border-t border-[hsl(var(--border))]">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                  usage.nudge
                    ? "border-amber-500/40 text-amber-400"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                <span className="font-semibold text-foreground">
                  {usage.blogsGenerated}
                </span>
                <span>/</span>
                <span>{usage.blogsLimit}</span>
                <span>blogs this week</span>
              </span>
            </div>
          )
        }
      />
      <BlogUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={usage?.effectiveRemaining === 0 ? "limit" : "cta"}
        weekEnd={usage?.weekEnd}
        currentUsage={
          usage
            ? { blogsGenerated: usage.blogsGenerated, blogsLimit: usage.blogsLimit }
            : undefined
        }
      />
      <BlogEngineHelpModal open={showHelpModal} onOpenChange={setShowHelpModal} />
    </>
  );
}
