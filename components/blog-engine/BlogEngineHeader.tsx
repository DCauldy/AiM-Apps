"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { Button } from "@/components/ui/button";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { BlogEngineHelpModal } from "@/components/blog-engine/BlogEngineHelpModal";

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

export function BlogEngineHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/apps/blog-engine/dashboard") {
      return (
        pathname === "/apps/blog-engine/dashboard" ||
        pathname === "/apps/blog-engine"
      );
    }
    return pathname?.startsWith(href);
  };

  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex items-center h-14 px-4">
        {/* Left: Logo + Title + AppSwitcher */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/apps/blog-engine/dashboard" className="flex items-center gap-2.5">
            <Image
              src="/logo-white.svg"
              alt="AiM Academy"
              width={120}
              height={40}
              className="h-9 w-auto sm:h-10 shrink-0"
            />
          </Link>
          <div className="hidden sm:block">
            <AppSwitcher />
          </div>
        </div>

        {/* Center: Tab navigation (desktop) */}
        <nav className="hidden md:flex items-center gap-1 mx-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium font-body transition-colors rounded-md",
                  active
                    ? "text-[#31DBA5]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#31DBA5] rounded-full shadow-[0_0_6px_rgba(49,219,165,0.5)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Usage badge + UserMenu */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHelpModal(true)}
            title="How to use Blog Engine"
            className="text-foreground hover:bg-accent relative"
          >
            <div className="help-icon-wrapper">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 sm:h-6 sm:w-6"
              >
                <defs>
                  <linearGradient id="helpIconGradientBE" x1="0%" y1="0%" x2="0%" y2="100%" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#31DBA5" />
                    <stop offset="50%" stopColor="#25B88A" />
                    <stop offset="100%" stopColor="#1C4C8A" />
                  </linearGradient>
                </defs>
                <circle cx="12" cy="12" r="10" stroke="url(#helpIconGradientBE)" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="url(#helpIconGradientBE)" />
                <circle cx="12" cy="17" r="0.35" fill="#317196" />
              </svg>
            </div>
          </Button>
          <UserMenu />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-2 text-sm font-medium font-body rounded-md transition-colors",
                  active
                    ? "text-[#31DBA5] bg-[#31DBA5]/10"
                    : "text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {/* Mobile AppSwitcher */}
          <div className="pt-2 border-t border-[hsl(var(--border))]">
            <AppSwitcher />
          </div>
          {/* Mobile usage */}
          {usage && (
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
          )}
        </nav>
      )}
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
    </header>
  );
}
