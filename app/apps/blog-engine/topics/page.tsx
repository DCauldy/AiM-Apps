"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { TopicList } from "@/components/blog-engine/topics/TopicList";
import { useToast } from "@/components/ui/toast";
import type { BofuTopic } from "@/types/blog-engine";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

export default function TopicsPage() {
  const { addToast } = useToast();
  const [topics, setTopics] = useState<BofuTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenGeneratingRef = useRef(false);

  const fetchTopics = useCallback(async () => {
    try {
      const response = await fetch("/api/apps/blog-engine/topics");
      if (response.ok) {
        const data = await response.json();
        setTopics(data.topics);
      }
    } catch {
      console.error("Failed to fetch topics");
    } finally {
      setLoading(false);
    }
  }, []);

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
      const data: { generating: boolean } = await res.json();

      if (data.generating) {
        seenGeneratingRef.current = true;
      }

      if (seenGeneratingRef.current && !data.generating) {
        setGenerating(false);
        stopPolling();
        // Refresh topics to pick up the "written" status
        await fetchTopics();
        // Dispatch event so the header usage badge updates
        window.dispatchEvent(new Event("blog-usage-updated"));
      }
    } catch {
      // Silently ignore — will retry next tick
    }
  }, [stopPolling, fetchTopics]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    setGenerating(true);
    seenGeneratingRef.current = false;
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      setGenerating(false);
      stopPolling();
      fetchTopics();
    }, POLL_TIMEOUT_MS);
  }, [pollStatus, stopPolling, fetchTopics]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // Auto-start polling if any topic is currently "writing".
  // Also detect stale "writing" topics where the pipeline already finished/failed.
  useEffect(() => {
    if (!loading && topics.some((t) => t.status === "writing")) {
      // Check immediately whether the pipeline is actually running
      fetch("/api/apps/blog-engine/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !data.generating) {
            // Pipeline isn't running — these topics are stale. Refresh to get
            // the corrected status (the pipeline error handler resets them now).
            fetchTopics();
          } else {
            // Pipeline is actively running — start polling for completion
            seenGeneratingRef.current = true;
            startPolling();
          }
        })
        .catch(() => {
          // Can't tell — assume it's running and poll
          seenGeneratingRef.current = true;
          startPolling();
        });
    }
    return stopPolling;
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWriteTopic = async (topicId: string) => {
    setIsRunning(true);
    try {
      const response = await fetch("/api/apps/blog-engine/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
      });

      if (response.ok) {
        await fetchTopics();
        startPolling();
      }
    } catch {
      console.error("Failed to trigger pipeline");
    } finally {
      setIsRunning(false);
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    // Optimistically reorder local state
    setTopics((prev) => {
      const idOrder = new Map(orderedIds.map((id, i) => [id, i]));
      const reordered = [...prev].sort((a, b) => {
        const aIdx = idOrder.get(a.id);
        const bIdx = idOrder.get(b.id);
        // Items in the ordered list come first, in their new order
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
        if (aIdx !== undefined) return -1;
        if (bIdx !== undefined) return 1;
        return 0;
      });
      return reordered;
    });

    try {
      await fetch("/api/apps/blog-engine/topics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", orderedIds }),
      });
    } catch {
      console.error("Failed to save reorder");
      // Refresh from server on failure
      fetchTopics();
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    const startingCount = topics.length;
    try {
      const res = await fetch("/api/apps/blog-engine/topics/discover", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Discovery failed");
      }
      addToast({
        title: "Searching for new topics…",
        description: "This usually takes 30–60 seconds. Topics will appear here.",
      });

      // Light polling — refetch a few times so the new topics show up
      // without needing a manual refresh. The Inngest function runs in
      // the background; we just want to render its output when ready.
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts += 1;
        await fetchTopics();
        if (attempts >= 12) {
          // ~60s of polling, then stop
          clearInterval(poll);
          setDiscovering(false);
        }
      }, 5_000);

      // Also stop polling early if we see the topic count grow
      const stopOnGrowth = setInterval(() => {
        if (topics.length > startingCount) {
          clearInterval(poll);
          clearInterval(stopOnGrowth);
          setDiscovering(false);
        }
      }, 1_000);
      setTimeout(() => clearInterval(stopOnGrowth), 65_000);
    } catch (err) {
      addToast({
        title: "Discovery failed",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
      setDiscovering(false);
    }
  };

  const handleSkipTopic = async (topicId: string) => {
    try {
      const response = await fetch("/api/apps/blog-engine/topics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, status: "skipped" }),
      });

      if (response.ok) {
        setTopics((prev) =>
          prev.map((t) =>
            t.id === topicId ? { ...t, status: "skipped" as const } : t
          )
        );
      }
    } catch {
      console.error("Failed to skip topic");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading topics...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-sans text-xl font-bold text-foreground">Topic Bank</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Topics discovered and scored for your market. Click &quot;Write&quot; to
              generate a blog from any available topic.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDiscover}
            disabled={discovering}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
            title="Run topic research now without spending a weekly blog slot"
          >
            {discovering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {discovering ? "Discovering…" : "Discover Topics"}
          </button>
        </div>

        {/* Pipeline activity banner */}
        {generating && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-6">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-medium text-foreground">
              Writing your blog&hellip;
            </span>
            <span className="text-sm text-muted-foreground">
              This usually takes about a minute.
            </span>
          </div>
        )}

        <TopicList
          topics={topics}
          onWriteTopic={handleWriteTopic}
          onSkipTopic={handleSkipTopic}
          onReorder={handleReorder}
          isRunning={isRunning || generating}
        />
      </div>
    </div>
  );
}
