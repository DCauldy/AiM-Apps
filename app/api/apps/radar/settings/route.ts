import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  getAccountInfo,
  listBrandReports,
  listBrandReportPrompts,
} from "@/lib/radar-otterly/accessors";
import { RADAR_INCLUDED_TIER } from "@/lib/radar-packs";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type {
  OtterlyAccountInfo,
  OtterlyBrandReport,
} from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";

interface SettingsResponse {
  status:
    | "ready"
    | "no_active_profile"
    | "no_website_url"
    | "no_matching_report"
    | "otterly_error";
  report?: OtterlyBrandReport;
  account?: OtterlyAccountInfo;
  websiteUrl?: string;
  /** Tier caps + currently-tracked counts so Customize forms can
   *  enforce replace-when-full UX. */
  capacity?: {
    promptsCap: number;
    promptsUsed: number;
    competitorsCap: number;
    competitorsUsed: number;
  };
  /** Compact list of currently-tracked prompts (id + text) for the
   *  "replace which prompt?" dropdown. */
  trackedPrompts?: Array<{ id: string; prompt: string }>;
  error?: { message: string; status: number };
}

/**
 * GET /api/apps/radar/settings
 *
 * Powers the read-only Settings tab. Returns the agent's tracked
 * config + account quota. Mutating settings (notifications, alert
 * thresholds, engine selection) lands later when we have schema +
 * partner-API access for runtime changes.
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
    return Response.json({ status: "no_active_profile" } as SettingsResponse);
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
    return Response.json({ status: "no_website_url" } as SettingsResponse);
  }

  try {
    const [account, reportsList] = await Promise.all([
      getAccountInfo(),
      listBrandReports(),
    ]);
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) {
      return Response.json({ status: "no_matching_report" } as SettingsResponse);
    }

    // Pull tracked prompts for the Customize forms. Cheap call —
    // small list. If it fails we still return the rest of Settings.
    const country = report.countries[0] ?? "us";
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .split("T")[0];
    let trackedPrompts: Array<{ id: string; prompt: string }> = [];
    try {
      const prompts = await listBrandReportPrompts(report.id, {
        startDate,
        endDate,
        country,
      });
      trackedPrompts = prompts.items.map((p) => ({
        id: p.id,
        prompt: p.prompt,
      }));
    } catch {
      // Non-fatal — Customize form will hide the replace selector.
    }

    // Tier caps: hardcoded to RADAR_INCLUDED_TIER until per-customer
    // subscription schema exists.
    const capacity = {
      promptsCap: RADAR_INCLUDED_TIER.prompts,
      promptsUsed: trackedPrompts.length,
      competitorsCap: RADAR_INCLUDED_TIER.competitors,
      competitorsUsed: report.competitors.length,
    };

    return Response.json({
      status: "ready",
      report,
      account,
      websiteUrl,
      capacity,
      trackedPrompts,
    } as SettingsResponse);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json({
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      } as SettingsResponse);
    }
    return Response.json({
      status: "otterly_error",
      error: {
        message: e instanceof Error ? e.message : "Unknown error",
        status: 500,
      },
    } as SettingsResponse);
  }
}
