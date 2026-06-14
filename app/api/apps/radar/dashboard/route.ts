import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  getAccountInfo,
  getBrandReportRecommendations,
  getBrandReportStats,
  listBrandReports,
} from "@/lib/radar-otterly/accessors";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type {
  OtterlyAccountInfo,
  OtterlyBrandReport,
  OtterlyBrandReportStats,
  OtterlyRecommendation,
} from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";
// Otterly stats/recommendations + report list = ~3 API calls per
// dashboard load. Cheap, but we still keep this server-side so the
// Otterly bearer token never leaks to the browser.
export const maxDuration = 30;

interface RadarDashboardResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "no_matching_report"
    | "otterly_error";
  // Set when status === "ready"
  profile?: { id: string; website_url: string; hostname: string };
  account?: OtterlyAccountInfo;
  report?: OtterlyBrandReport;
  stats?: OtterlyBrandReportStats;
  recommendations?: OtterlyRecommendation[];
  // Set when status === "no_matching_report" — surface the candidate
  // hostname so the gating UI can say "create a brand report with
  // brandDomain = <hostname>".
  hostname?: string;
  // Set when status === "otterly_error"
  error?: { message: string; status: number };
}

/**
 * GET /api/apps/radar/dashboard
 *
 * Aggregates everything the new Otterly-backed Radar dashboard needs
 * for the user's active profile, in one round trip from the browser.
 *
 * Flow:
 *   1. Resolve user + active profile (Supabase auth).
 *   2. Pull account info (cheap; powers the trial-expiry banner +
 *      quota readout).
 *   3. List brand reports + find the one matching the profile's
 *      website_url hostname (or one of its variations).
 *   4. If matched → fetch stats + recommendations in parallel.
 *   5. Return everything in a single discriminated-union response so
 *      the dashboard can render the right state without juggling
 *      multiple fetches.
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
    const payload: RadarDashboardResponse = { status: "no_active_profile" };
    return Response.json(payload);
  }

  // platform_profiles stores website_url; we use it as the brand key.
  // Use service-role to avoid RLS surprises on the cross-profile read.
  const service = createServiceRoleClient();
  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("id, website_url")
    .eq("id", profile.id)
    .maybeSingle();
  const websiteUrl = (profileRow?.website_url ?? null) as string | null;
  const hostname = normalizeHostname(websiteUrl);
  if (!websiteUrl || !hostname) {
    const payload: RadarDashboardResponse = { status: "no_website_url" };
    return Response.json(payload);
  }

  try {
    // Account info first — surfaces trial-expiry / quota warnings on
    // every load, doesn't depend on a matching brand report.
    const account = await getAccountInfo();

    // List ALL reports across workspaces this API key can see, find
    // the one matching the profile hostname. Trial/Standard accounts
    // usually have a small report count so we don't bother paging.
    const reportsList = await listBrandReports();
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) {
      const payload: RadarDashboardResponse = {
        status: "no_matching_report",
        hostname,
        account,
      };
      return Response.json(payload);
    }

    // Stats + recommendations for the last 30 days. Country is taken
    // from the report's configured countries (Otterly tracks per
    // country); we use the first one. Multi-country dashboards are
    // a follow-up — for v1 the single-country view is sufficient.
    const country = report.countries[0] ?? "us";
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const endDate = now.toISOString().split("T")[0];
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];

    const [stats, recommendations] = await Promise.all([
      getBrandReportStats(report.id, { startDate, endDate, country }),
      getBrandReportRecommendations(report.id, { country }).then((r) => r.items),
    ]);

    const payload: RadarDashboardResponse = {
      status: "ready",
      profile: { id: profile.id, website_url: websiteUrl, hostname },
      account,
      report,
      stats,
      recommendations,
    };
    return Response.json(payload);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      const payload: RadarDashboardResponse = {
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      };
      return Response.json(payload, { status: 200 });
    }
    return Response.json(
      {
        status: "otterly_error",
        error: {
          message: e instanceof Error ? e.message : "Unknown error",
          status: 500,
        },
      },
      { status: 200 },
    );
  }
}
