"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Loader2, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardOverview } from "@/components/blog-engine/dashboard/DashboardOverview";
import { BlogList } from "@/components/blog-engine/dashboard/BlogList";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import type { BofuBlog, BofuUsageStatus } from "@/types/blog-engine";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3-minute safety timeout

export interface BlogEngineCmsHealth {
  activeConnections: number;
  platform: string | null;
  lastPublishAt: string | null;
  lastError: string | null;
}

interface DashboardClientProps {
  usage: BofuUsageStatus;
  blogs: BofuBlog[];
  totalBlogs: number;
  publishedBlogs: number;
  topicBankSize: number;
  nextRunAt?: string;
  cmsConnected: boolean;
  cmsHealth: BlogEngineCmsHealth;
  failedBlogsCount: number;
}

export function DashboardClient({
  usage,
  blogs,
  totalBlogs,
  publishedBlogs,
  topicBankSize,
  nextRunAt,
  cmsConnected,
  cmsHealth,
  failedBlogsCount,
}: DashboardClientProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"limit" | "cta">("cta");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenGeneratingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    seenGeneratingRef.current = false;
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/blog-engine/status");
      if (!res.ok) return;
      const data: { generating: boolean; blogCount: number } =
        await res.json();

      // Track whether we've ever seen the generating flag — the placeholder
      // row may not exist on the very first poll tick (Inngest is async).
      if (data.generating) {
        seenGeneratingRef.current = true;
      }

      // Pipeline is done once the generating flag drops back to false
      // AFTER we've observed it being true at least once.
      if (seenGeneratingRef.current && !data.generating) {
        setGenerating(false);
        stopPolling();
        router.refresh();
      }
    } catch {
      // Silently ignore polling errors — will retry on next tick
    }
  }, [stopPolling, router]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    setGenerating(true);
    seenGeneratingRef.current = false;
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);

    // Safety timeout — stop polling after 3 minutes and refresh anyway
    timeoutRef.current = setTimeout(() => {
      setGenerating(false);
      stopPolling();
      router.refresh();
    }, POLL_TIMEOUT_MS);
  }, [pollStatus, stopPolling, router]);

  // On mount, auto-start polling if any blog is currently generating
  useEffect(() => {
    const hasGenerating = blogs.some(
      (b) => b.publish_status === "generating"
    );
    if (hasGenerating) {
      seenGeneratingRef.current = true;
      startPolling();
    }
    return stopPolling;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualRun = async () => {
    setIsRunning(true);
    setRunError(null);

    try {
      const response = await fetch("/api/apps/blog-engine/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.error === "usage_limit_reached") {
          if (data.upgradeAvailable) {
            setUpgradeReason("limit");
            setShowUpgradeModal(true);
          }
          setRunError(
            `You've used all ${usage.blogsLimit} blogs this week.`
          );
        } else {
          setRunError(data.error || "Failed to start pipeline");
        }
        return;
      }

      startPolling();
    } catch {
      setRunError("Failed to start pipeline. Please try again.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-sans text-xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your automated blog generation hub
            </p>
          </div>

          {usage.effectiveRemaining <= 0 ? (
            <button
              onClick={() => {
                setUpgradeReason("limit");
                setShowUpgradeModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-90 text-white shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
              }}
            >
              <Zap className="h-4 w-4" />
              Upgrade to Generate More
            </button>
          ) : (
            <button
              onClick={handleManualRun}
              disabled={isRunning || generating}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                generating
                  ? "border border-primary text-primary bg-transparent be-generating"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              )}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Generate Blog
            </button>
          )}
        </div>

        {/* Health rail — matches Hyperlocal pattern. Severity dot + summary
            of CMS connection + recent failures + Settings link. */}
        <HealthRail
          cms={cmsHealth}
          cmsConnected={cmsConnected}
          failedBlogsCount={failedBlogsCount}
        />

        {/* Error banner */}
        {runError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between">
            <span>{runError}</span>
            {usage.effectiveRemaining <= 0 && (
              <button
                type="button"
                onClick={() => {
                  setUpgradeReason("limit");
                  setShowUpgradeModal(true);
                }}
                className="text-xs font-medium underline underline-offset-2 hover:no-underline shrink-0 ml-3"
              >
                Upgrade
              </button>
            )}
          </div>
        )}

        {/* Low-quota banner — fires at ≤1 remaining (incl. 0 = limit reached). */}
        {usage.nudge && !runError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-center justify-between">
            <span>
              {usage.effectiveRemaining === 0
                ? "No blogs remaining this week"
                : `${usage.effectiveRemaining} blog${
                    usage.effectiveRemaining === 1 ? "" : "s"
                  } remaining this week`}
            </span>
            <button
              type="button"
              onClick={() => {
                setUpgradeReason("cta");
                setShowUpgradeModal(true);
              }}
              className="text-xs font-medium underline underline-offset-2 hover:no-underline shrink-0 ml-3"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Pipeline activity banner */}
        {generating && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-medium text-foreground">
              Generating your blog&hellip;
            </span>
            <span className="text-sm text-muted-foreground">
              This usually takes about a minute.
            </span>
          </div>
        )}

        {/* Overview cards */}
        <DashboardOverview
          usage={usage}
          totalBlogs={totalBlogs}
          publishedBlogs={publishedBlogs}
          topicBankSize={topicBankSize}
          nextRunAt={nextRunAt}
          cmsConnected={cmsConnected}
          onUpgradeClick={() => {
            setUpgradeReason("cta");
            setShowUpgradeModal(true);
          }}
        />

        {/* Blog list */}
        <div>
          <h2 className="font-sans text-base font-semibold text-foreground mb-4">
            Recent Blogs
          </h2>
          <BlogList blogs={blogs} />
        </div>
      </div>

      <BlogUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeReason}
        weekEnd={usage.weekEnd}
        currentUsage={{
          blogsGenerated: usage.blogsGenerated,
          blogsLimit: usage.blogsLimit,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health rail — Hyperlocal-style slim status row. Severity escalates with:
//   - bad:  CMS connection broken (last_error set) OR no active CMS at all
//   - warn: blogs have failed this week (any pipeline_error in the window)
//   - good: connection healthy + no failures
// ---------------------------------------------------------------------------
function HealthRail({
  cms,
  cmsConnected,
  failedBlogsCount,
}: {
  cms: BlogEngineCmsHealth;
  cmsConnected: boolean;
  failedBlogsCount: number;
}) {
  const severity: "good" | "warn" | "bad" = !cmsConnected || cms.lastError
    ? "bad"
    : failedBlogsCount > 0
      ? "warn"
      : "good";

  const dotClass =
    severity === "good"
      ? "bg-emerald-500"
      : severity === "warn"
        ? "bg-amber-500"
        : "bg-rose-500";

  const headline =
    severity === "good"
      ? "All systems good"
      : severity === "warn"
        ? "Worth a look"
        : "Needs attention";

  const parts: string[] = [];
  if (!cmsConnected) {
    parts.push("no CMS connection");
  } else if (cms.lastError) {
    parts.push(`CMS error: ${truncate(cms.lastError, 60)}`);
  } else if (cms.lastPublishAt) {
    parts.push(`last publish ${relativeTime(cms.lastPublishAt)}`);
  } else {
    parts.push("no posts published yet");
  }
  if (failedBlogsCount > 0) {
    parts.push(
      `${failedBlogsCount} failed run${failedBlogsCount === 1 ? "" : "s"}`,
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-2 text-foreground font-medium">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        {headline}
      </span>
      <span className="hidden sm:inline opacity-40">·</span>
      <span>{parts.join(" · ")}</span>
      <span className="ml-auto flex items-center gap-3">
        {cms.platform && cmsConnected && (
          <span className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 opacity-60" />
            <span className="text-foreground/80 capitalize">{cms.platform}</span>
          </span>
        )}
        <Link
          href="/apps/blog-engine/settings?tab=publishing"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings
        </Link>
      </span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
