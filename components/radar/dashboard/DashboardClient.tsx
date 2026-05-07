"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VisibilityScore } from "./VisibilityScore";
import { EngineBreakdown } from "./EngineBreakdown";
import { AlertsFeed } from "./AlertsFeed";
import { QuickActions } from "./QuickActions";
import type { RadarConfig, RadarCheck, RadarAlert, RadarResult, RadarUsageStatus } from "@/types/radar";

interface DashboardClientProps {
  config: RadarConfig;
  latestCheck: RadarCheck | null;
  latestResults?: RadarResult[];
  alerts: RadarAlert[];
  usage: RadarUsageStatus;
}

const POLL_INTERVAL_MS = 3000;

export function DashboardClient({
  config,
  latestCheck: initialLatestCheck,
  latestResults: initialResults = [],
  alerts: initialAlerts,
  usage: initialUsage,
}: DashboardClientProps) {
  const router = useRouter();
  const [latestCheck, setLatestCheck] = useState(initialLatestCheck);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [usage, setUsage] = useState(initialUsage);
  const [engineResults, setEngineResults] = useState<RadarResult[]>(initialResults);
  const [checkRunning, setCheckRunning] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [currentCheck, setCurrentCheck] = useState<RadarCheck | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/apps/radar/checks?latest=true");
        if (!res.ok) return;
        const data = await res.json();
        const check = data.check as RadarCheck | null;
        if (!check) return;

        setCurrentCheck(check);

        if (check.status === "completed" || check.status === "completed_partial" || check.status === "failed") {
          stopPolling();
          setLatestCheck(check);
          setEngineResults(data.results || []);
          // Prepend new alerts to existing
          if (data.alerts && data.alerts.length > 0) {
            setAlerts((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newAlerts = (data.alerts as RadarAlert[]).filter((a) => !existingIds.has(a.id));
              return [...newAlerts, ...prev];
            });
          }
          setCheckRunning(false);
        }
      } catch {
        // Silently continue polling on network error
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const handleRunCheck = useCallback(async () => {
    setCheckRunning(true);
    setCheckError(null);
    setCurrentCheck(null);
    try {
      const res = await fetch("/api/apps/radar/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      if (res.ok) {
        // Decrement remaining checks in local usage state
        setUsage((prev) => ({
          ...prev,
          manualChecksUsed: prev.manualChecksUsed + 1,
        }));
        // Start polling for results
        startPolling();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === "manual_check_limit_reached") {
          setCheckError("You've used all your manual checks this month.");
        } else {
          setCheckError(data.error || "Failed to trigger check. Please try again.");
        }
        setCheckRunning(false);
      }
    } catch (err) {
      console.error("Run check error:", err);
      setCheckError("Network error — could not reach the server.");
      setCheckRunning(false);
    }
  }, [startPolling]);

  const handleRunAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/radar/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.push("/apps/radar/optimize");
      }
    } catch {
      // Error handled silently
    }
  }, [router]);

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = alerts.filter((a) => !a.read).map((a) => a.id);
    if (unreadIds.length === 0) return;

    try {
      await fetch("/api/apps/radar/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds, read: true }),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch {
      // Error handled silently
    }
  }, [alerts]);

  // Derive previous score for trend display
  const previousScore = initialLatestCheck?.visibility_score != null
    ? initialLatestCheck.visibility_score
    : undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top row: Score + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <VisibilityScore
              score={latestCheck?.visibility_score ?? null}
              previousScore={previousScore}
              lastCheckAt={latestCheck?.completed_at}
            />
          </div>
          <div>
            <QuickActions
              usage={usage}
              onRunCheck={handleRunCheck}
              onRunAudit={handleRunAudit}
              checkRunning={checkRunning}
              checkError={checkError}
              checkStatus={currentCheck}
              totalQueries={usage.queriesUsed}
            />
          </div>
        </div>

        {/* Engine Breakdown */}
        <EngineBreakdown
          results={engineResults}
          engines={config.monitored_engines}
        />

        {/* Alerts */}
        <AlertsFeed
          alerts={alerts}
          onMarkAllRead={handleMarkAllRead}
        />
      </div>
    </div>
  );
}
