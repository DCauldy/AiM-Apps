"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/toast";

import type { OptimizeResponse } from "./optimize/types";
import { GateState, OptimizeSkeleton } from "./optimize/shared";
import { SiteHealthSection } from "./optimize/SiteHealthSection";
import {
  GapsSection,
  QuickWinsSection,
  WinsSection,
} from "./optimize/InsightSections";
import { RunAuditSection } from "./optimize/RunAuditSection";
import { HistorySection } from "./optimize/HistorySection";

// ============================================================
// Optimize tab — customer-facing helpful insights.
//
// Built for the agent who wants to know "what should I do this
// week?" not for an admin running tracking config. AiM-side ops
// surfaces (add competitors, add prompts, etc.) live in the admin
// queue at /admin/radar-requests.
//
// Sections in priority order:
//   1. Site health    — latest content-check scores + fix-it copy
//   2. Your wins      — prompts ranking #1-#3
//   3. Quick wins     — prompts close to ranking + missing-with-volume
//   4. Gaps           — competitors winning, you're absent
//   5. Check another  — slim audit form, secondary
//   6. History        — collapsed by default
//
// Each section lives in its own file under ./optimize/. This shell
// only owns the fetch + status routing.
// ============================================================

export function RadarOptimizeClient() {
  const { addToast } = useToast();
  const [data, setData] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apps/radar/optimize", {
        cache: "no-store",
      });
      const payload = (await res.json()) as OptimizeResponse;
      if (!res.ok) throw new Error("Failed to load Optimize");
      setData(payload);
    } catch (e) {
      addToast({
        title: "Couldn't load Optimize",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <OptimizeSkeleton />;
  if (!data) return <OptimizeSkeleton />;

  switch (data.status) {
    case "no_active_profile":
      return (
        <GateState
          title="Set up a profile first"
          body="Optimize shows what to work on this week to improve AI visibility. Pick or create a profile to continue."
        />
      );
    case "no_website_url":
      return (
        <GateState
          title="Add your website URL"
          body="Add a Website URL to your active profile so we can match it to your AI tracking setup."
        />
      );
    case "no_matching_report":
      return (
        <GateState
          title="Tracking isn't set up yet"
          body="Head to the Dashboard to request setup. Once your data starts populating you'll see actionable insights here."
        />
      );
    case "otterly_error":
      return (
        <GateState
          title="Optimize is temporarily unavailable"
          body={`Couldn't load right now. ${data.error?.message ?? ""}`}
        />
      );
    case "ready":
      break;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Optimize</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What to work on this week to improve how AI engines see{" "}
            {data.report?.brand ?? "your brand"}.
          </p>
        </div>

        <SiteHealthSection
          audit={data.siteHealth?.audit ?? null}
          defaultUrl={data.defaultUrl ?? ""}
          workspaceId={data.workspaceId ?? ""}
          onRanAudit={load}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <WinsSection wins={data.wins ?? []} />
          <QuickWinsSection quickWins={data.quickWins ?? []} />
          <GapsSection gaps={data.gaps ?? []} />
        </div>

        <RunAuditSection
          workspaceId={data.workspaceId ?? ""}
          defaultUrl={data.defaultUrl ?? ""}
          onComplete={load}
        />

        <HistorySection
          contentChecks={data.contentChecks ?? []}
          crawlabilityChecks={data.crawlabilityChecks ?? []}
        />
      </div>
    </div>
  );
}
