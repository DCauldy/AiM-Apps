"use client";

import { useState, useEffect } from "react";
import {
  Play,
  Search,
  Shield,
  Loader2,
  BarChart3,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RadarCheck, RadarUsageStatus } from "@/types/radar";

interface QuickActionsProps {
  usage: RadarUsageStatus;
  onRunCheck: () => void;
  onRunAudit: () => void;
  checkRunning?: boolean;
  checkError?: string | null;
  checkStatus?: RadarCheck | null;
  totalQueries?: number;
}

export function QuickActions({
  usage,
  onRunCheck,
  onRunAudit,
  checkRunning = false,
  checkError = null,
  checkStatus = null,
  totalQueries = 0,
}: QuickActionsProps) {
  const checksRemaining = usage.manualChecksLimit - usage.manualChecksUsed;
  const auditsRemaining = usage.auditsLimit - usage.auditsUsed;
  const [showComplete, setShowComplete] = useState(false);

  // Auto-dismiss success message after 5s
  useEffect(() => {
    if (checkStatus?.status === "completed" || checkStatus?.status === "completed_partial") {
      setShowComplete(true);
      const timer = setTimeout(() => setShowComplete(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowComplete(false);
    }
  }, [checkStatus?.status, checkStatus?.id]);

  return (
    <div className="rounded-xl border bg-card p-6 h-full flex flex-col">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Quick Actions
      </h3>

      <div className="space-y-2 flex-1">
        <Button
          onClick={onRunCheck}
          disabled={checkRunning || checksRemaining <= 0}
          className="w-full justify-start bg-[#e0a458] hover:bg-[#c88d3e] text-white"
        >
          {checkRunning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {checkRunning ? "Running Check..." : "Run Check"}
        </Button>

        {checkError && (
          <p className="text-xs text-destructive px-1">{checkError}</p>
        )}

        {/* Live check progress */}
        {checkRunning && checkStatus?.status === "running" && (
          <div className="flex items-center gap-2 px-1 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-[#e0a458]" />
            <p className="text-xs text-muted-foreground">
              Scanning engines...
              {checkStatus.queries_checked > 0 && (
                <span className="text-foreground ml-1">
                  ({checkStatus.queries_checked}{totalQueries ? `/${totalQueries}` : ""} queries checked)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Pending/initial state after trigger */}
        {checkRunning && !checkStatus && !checkError && (
          <div className="flex items-center gap-2 px-1 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-[#e0a458]" />
            <p className="text-xs text-muted-foreground">
              Starting check...
            </p>
          </div>
        )}

        {/* Check complete */}
        {showComplete && checkStatus && (
          <div className="flex items-center gap-2 px-1 py-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <p className="text-xs text-green-500">
              Check complete
              {checkStatus.visibility_score != null && (
                <span> — score: {checkStatus.visibility_score}/100</span>
              )}
            </p>
          </div>
        )}

        {/* Check failed */}
        {checkStatus?.status === "failed" && !checkRunning && (
          <div className="flex items-center gap-2 px-1 py-1">
            <XCircle className="h-3 w-3 text-red-400" />
            <p className="text-xs text-red-400">
              Check failed — some engines may have timed out.
            </p>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full justify-start border-[#1c4c8a]/30 text-foreground hover:bg-[#1c4c8a]/10"
          onClick={() => {
            window.location.href = "/apps/radar/research";
          }}
        >
          <Search className="h-4 w-4 mr-2 text-[#1c4c8a]" />
          Discover Queries
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start border-border text-foreground hover:bg-accent/50"
          onClick={onRunAudit}
          disabled={auditsRemaining <= 0}
        >
          <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
          Run Audit
        </Button>
      </div>

      {/* Usage stats */}
      <div className="mt-4 pt-4 border-t border-border space-y-2">
        <UsageStat
          icon={BarChart3}
          label="Queries tracked"
          used={usage.queriesUsed}
          limit={usage.queryLimit}
        />
        <UsageStat
          icon={Play}
          label="Manual checks"
          used={usage.manualChecksUsed}
          limit={usage.manualChecksLimit}
        />
        <UsageStat
          icon={Shield}
          label="Audits"
          used={usage.auditsUsed}
          limit={usage.auditsLimit}
        />
      </div>
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  used: number;
  limit: number;
}) {
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = used >= limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <span
          className={cn(
            "font-medium",
            isAtLimit
              ? "text-red-400"
              : isNearLimit
                ? "text-yellow-400"
                : "text-foreground"
          )}
        >
          {used}/{limit}
        </span>
      </div>
      <div className="h-1 rounded-full bg-border overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isAtLimit
              ? "bg-red-400"
              : isNearLimit
                ? "bg-yellow-400"
                : "bg-[#e0a458]"
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
