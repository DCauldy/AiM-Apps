"use client";

import { FileText, Clock, Globe, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BofuUsageStatus } from "@/types/blog-engine";

interface DashboardOverviewProps {
  usage: BofuUsageStatus;
  totalBlogs: number;
  publishedBlogs: number;
  topicBankSize: number;
  nextRunAt?: string;
  cmsConnected: boolean;
  onUpgradeClick?: () => void;
}

export function DashboardOverview({
  usage,
  totalBlogs,
  publishedBlogs,
  topicBankSize,
  nextRunAt,
  cmsConnected,
  onUpgradeClick,
}: DashboardOverviewProps) {
  const usagePercent =
    usage.blogsLimit > 0
      ? Math.round((usage.blogsGenerated / usage.blogsLimit) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Usage meter */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Weekly Usage
          </span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-2xl font-bold text-foreground">
            {usage.blogsGenerated}
          </span>
          <span className="text-sm text-muted-foreground">
            of {usage.blogsLimit}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 be-glow",
              usagePercent >= 100
                ? "bg-destructive"
                : usagePercent >= 80
                  ? "bg-amber-500"
                  : "bg-primary"
            )}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        {usage.bonusBlogs > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            +{usage.bonusBlogs} bonus blogs available
          </p>
        )}
        {usagePercent >= 100 && onUpgradeClick && (
          <button
            type="button"
            onClick={onUpgradeClick}
            className="text-xs text-primary font-medium mt-1 hover:underline"
          >
            Upgrade for more
          </button>
        )}
        {usage.nudge && usagePercent < 100 && (
          <button
            type="button"
            onClick={onUpgradeClick}
            className="text-xs text-amber-500 mt-1 hover:underline"
          >
            Running low — upgrade
          </button>
        )}
      </div>

      {/* Total blogs */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total Blogs
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">
            {totalBlogs}
          </span>
          <span className="text-sm text-muted-foreground">
            ({publishedBlogs} published)
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {topicBankSize} topics in bank
        </p>
      </div>

      {/* Next run */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Next Blog
          </span>
        </div>
        {nextRunAt ? (
          <>
            <p className="text-sm font-medium text-foreground">
              {formatNextRun(nextRunAt)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelativeTime(nextRunAt)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No runs scheduled</p>
        )}
      </div>

      {/* CMS status */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Blog Site
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              cmsConnected ? "bg-[#31DBA5]" : "bg-muted-foreground/30"
            )}
          />
          <span className="text-sm font-medium text-foreground">
            {cmsConnected ? "Connected" : "Not connected"}
          </span>
        </div>
        {!cmsConnected && (
          <p className="text-xs text-muted-foreground mt-1">
            Connect in Settings to auto-publish
          </p>
        )}
      </div>
    </div>
  );
}

function formatNextRun(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return "Overdue";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) {
    const minutes = Math.floor(diffMs / (1000 * 60));
    return `In ${minutes} minutes`;
  }
  if (hours < 24) return `In ${hours} hours`;

  const days = Math.floor(hours / 24);
  return `In ${days} day${days > 1 ? "s" : ""}`;
}
