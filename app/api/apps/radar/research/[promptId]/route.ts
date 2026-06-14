import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  listBrandReports,
  getBrandReportPrompt,
} from "@/lib/radar-otterly/accessors";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type { OtterlyPromptDetail } from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface DetailResponse {
  status: "ready" | "not_found" | "otterly_error";
  detail?: OtterlyPromptDetail;
  error?: { message: string; status: number };
}

/**
 * GET /api/apps/radar/research/[promptId]
 *
 * Lazy-loaded by the Research client when a prompt row expands.
 * Resolves the active profile's matched brand report (same logic as
 * dashboard / research index) and fetches per-prompt aggregates:
 * sentiment, brand rank, domain category mix, coverage history.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ promptId: string }> },
) {
  const { promptId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) return Response.json({ status: "not_found" });

  const service = createServiceRoleClient();
  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("website_url")
    .eq("id", profile.id)
    .maybeSingle();
  const hostname = normalizeHostname(
    (profileRow?.website_url ?? null) as string | null,
  );
  if (!hostname) return Response.json({ status: "not_found" });

  try {
    const reportsList = await listBrandReports();
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) return Response.json({ status: "not_found" });

    const country = report.countries[0] ?? "us";
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .split("T")[0];

    const detail = await getBrandReportPrompt(report.id, promptId, {
      startDate,
      endDate,
      country,
    });
    const payload: DetailResponse = { status: "ready", detail };
    return Response.json(payload);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      const payload: DetailResponse = {
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      };
      return Response.json(payload);
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
