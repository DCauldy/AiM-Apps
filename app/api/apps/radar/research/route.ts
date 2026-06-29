import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  listBrandReports,
  listBrandReportPrompts,
  listBrandReportCitations,
} from "@/lib/radar-otterly/accessors";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type {
  OtterlyBrandReport,
  OtterlyCitation,
  OtterlyPromptSummary,
} from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ResearchResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "no_matching_report"
    | "otterly_error";
  report?: OtterlyBrandReport;
  prompts?: OtterlyPromptSummary[];
  citations?: OtterlyCitation[];
  error?: { message: string; status: number };
}

/**
 * GET /api/apps/radar/research
 *
 * Aggregates everything the Research tab needs for the active profile
 * in one round trip: the matched brand report, the prompts list with
 * mention/coverage summaries, and the full citations list (so the
 * client can filter citations per-prompt when a row expands).
 *
 * Per-prompt detail (sentiment, brand rank breakdown, domain category
 * pie) is fetched lazily by the client via the per-prompt endpoint
 * when a row expands — keeps the initial load light.
 */
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    const payload: ResearchResponse = { status: "no_active_profile" };
    return Response.json(payload);
  }

  const service = createServiceRoleClient();
  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("website_url")
    .eq("id", profile.id)
    .maybeSingle();
  const websiteUrl = (profileRow?.website_url ?? null) as string | null;
  const hostname = normalizeHostname(websiteUrl);
  if (!websiteUrl || !hostname) {
    const payload: ResearchResponse = { status: "no_website_url" };
    return Response.json(payload);
  }

  try {
    const reportsList = await listBrandReports();
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) {
      const payload: ResearchResponse = { status: "no_matching_report" };
      return Response.json(payload);
    }

    const country = report.countries[0] ?? "us";
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .split("T")[0];

    const [prompts, citations] = await Promise.all([
      listBrandReportPrompts(report.id, { startDate, endDate, country }).then(
        (r) => r.items,
      ),
      listBrandReportCitations(report.id, { startDate, endDate, country }).then(
        (r) => r.items,
      ),
    ]);

    const payload: ResearchResponse = {
      status: "ready",
      report,
      prompts,
      citations,
    };
    return Response.json(payload);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json({
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      });
    }
    return Response.json({
      status: "otterly_error",
      error: {
        message: e instanceof Error ? e.message : "Unknown error",
        status: 500,
      },
    });
  }
}
