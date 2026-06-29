"use client";

import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Lightbulb, Settings, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState, useCallback } from "react";

interface BlogEngineSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

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

export function BlogEngineSidebar({ isOpen = true, onToggle }: BlogEngineSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [usageStatus, setUsageStatus] = useState<BofuUsageStatus | null>(null);

  const isDashboardActive = pathname === "/apps/blog-engine/dashboard" || pathname === "/apps/blog-engine";
  const isBlogsActive = pathname?.startsWith("/apps/blog-engine/blogs");
  const isTopicsActive = pathname === "/apps/blog-engine/topics";
  const isSettingsActive = pathname === "/apps/blog-engine/settings";

  const fetchUsage = useCallback(() => {
    fetch("/api/apps/blog-engine/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setUsageStatus(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsage();
    window.addEventListener("blog-usage-updated", fetchUsage);
    return () => window.removeEventListener("blog-usage-updated", fetchUsage);
  }, [fetchUsage]);

  const navigate = (path: string) => {
    router.push(path);
    if (window.innerWidth < 1024) onToggle?.();
  };

  return (
    <>
      <aside
        className={cn(
          "top-0 left-0 z-40 h-screen border-r bg-background flex flex-col",
          "w-[280px]",
          isOpen ? "sm:w-80" : "sm:w-64",
          "fixed transition-all duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* App Switcher */}
        <div className="p-3 border-b">
          <AppSwitcher />
        </div>

        {/* Navigation */}
        <div className="p-4 space-y-2">
          <Button
            variant={isDashboardActive ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => navigate("/apps/blog-engine/dashboard")}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Button
            variant={isBlogsActive ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => navigate("/apps/blog-engine/blogs")}
          >
            <FileText className="mr-2 h-4 w-4" />
            My Blogs
          </Button>
          <Button
            variant={isTopicsActive ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => navigate("/apps/blog-engine/topics")}
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            Topic Bank
          </Button>
          <Button
            variant={isSettingsActive ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => navigate("/apps/blog-engine/settings")}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>

        <Separator />

        {/* Spacer to push usage + profile to bottom */}
        <div className="flex-1" />

        {/* Usage indicator */}
        {usageStatus && (
          <div className="px-3 pb-2">
            <div className={cn(
              "rounded-lg border px-3 py-2 text-xs text-muted-foreground",
              usageStatus.nudge && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30"
            )}>
              <div>{usageStatus.blogsGenerated} / {usageStatus.blogsLimit} blogs this week</div>
              {usageStatus.bonusBlogs > 0 && (
                <div className="mt-1 text-emerald-600 dark:text-emerald-400">
                  +{usageStatus.bonusBlogs} bonus blog{usageStatus.bonusBlogs !== 1 ? "s" : ""}
                </div>
              )}
              {usageStatus.nudge && (
                <div className="mt-1 flex items-center gap-1 text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Running low on blogs</span>
                </div>
              )}
            </div>
          </div>
        )}

      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
