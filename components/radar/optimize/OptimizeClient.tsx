"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditSummary } from "./AuditSummary";
import { PageList } from "./PageList";
import type { RadarAudit, RadarAuditPage } from "@/types/radar";

interface OptimizeClientProps {
  audit: RadarAudit | null;
  pages: RadarAuditPage[];
}

export function OptimizeClient({ audit, pages }: OptimizeClientProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAudit = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/apps/radar/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to start audit.");
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setRunning(false);
    }
  }, [router]);

  const isAuditRunning = audit?.status === "pending" || audit?.status === "crawling" || audit?.status === "analyzing";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Optimize</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Audit your website for AI-readiness and get actionable recommendations.
            </p>
          </div>

          <Button
            onClick={handleRunAudit}
            disabled={running || isAuditRunning}
            className="bg-[#e0a458] hover:bg-[#c88d3e] text-white shrink-0"
          >
            {running || isAuditRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isAuditRunning ? "Audit Running..." : "Starting..."}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run New Audit
              </>
            )}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Running status */}
        {isAuditRunning && audit && (
          <div className="flex items-center gap-3 rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/5 px-4 py-3">
            <Loader2 className="h-4 w-4 text-[#e0a458] animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Audit in progress
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Status: {audit.status} — {audit.pages_found} pages found,{" "}
                {audit.pages_analyzed} analyzed
              </p>
            </div>
          </div>
        )}

        {/* No audit state */}
        {!audit && (
          <div className="text-center py-16 rounded-lg border border-dashed border-border">
            <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No audits yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Run your first audit to see how AI-ready your website is. We&apos;ll
              crawl your pages and score them across 6 key signals.
            </p>
          </div>
        )}

        {/* Audit results */}
        {audit && audit.status === "completed" && (
          <>
            <AuditSummary audit={audit} pages={pages} />
            <PageList pages={pages} />
          </>
        )}

        {/* Failed state */}
        {audit && audit.status === "failed" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-sm font-medium text-foreground mb-1">
              Audit failed
            </p>
            <p className="text-xs text-muted-foreground">
              Something went wrong while auditing your website. Please try running
              a new audit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
