"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardOverview } from "@/components/blog-engine/dashboard/DashboardOverview";
import { BlogList } from "@/components/blog-engine/dashboard/BlogList";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import type { BofuBlog, BofuUsageStatus } from "@/types/blog-engine";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3-minute safety timeout

interface DashboardClientProps {
  usage: BofuUsageStatus;
  blogs: BofuBlog[];
  totalBlogs: number;
  publishedBlogs: number;
  topicBankSize: number;
  nextRunAt?: string;
  cmsConnected: boolean;
}

export function DashboardClient({
  usage,
  blogs,
  totalBlogs,
  publishedBlogs,
  topicBankSize,
  nextRunAt,
  cmsConnected,
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

        {/* Nudge banner (1 remaining) */}
        {usage.nudge && !runError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-center justify-between">
            <span>1 blog remaining this week</span>
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
