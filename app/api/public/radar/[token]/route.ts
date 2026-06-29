import "server-only";

import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getBrandReportStats,
  listBrandReports,
} from "@/lib/radar-otterly/accessors";
import {
  findReportForHostname,
  normalizeHostname,
} from "@/lib/radar-otterly/match";
import { OtterlyApiError } from "@/lib/radar-otterly/client";
import type {
  OtterlyBrandReport,
  OtterlyBrandReportStats,
} from "@/lib/radar-otterly/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/public/radar/[token]
//
// Public, unauthenticated. Token lookup → profile's matching Otterly
// brand report → sanitized stats. Bumps view_count + last_viewed_at
// on the share-link row.
//
// Sanitization: drops account info (subscription tier, quota), brand
// report IDs, internal user IDs. Returns only what's safe to show
// to a stranger the customer chose to share with.

interface PublicResponse {
  status:
    | "ready"
    | "not_found"
    | "expired"
    | "revoked"
    | "no_data"
    | "otterly_error";
  brand?: string;
  brandDomain?: string;
  /** Sharer's chosen label, if set. Surfaced on the public page so
   *  viewers know who shared with them ("Caldwell Group · Q3 update"). */
  label?: string | null;
  /** Trimmed stats — no IDs, no quota leakage. */
  stats?: PublicSanitizedStats;
  error?: { message: string; status: number };
}

interface PublicSanitizedStats {
  totalMentions: number;
  averageRank: number | null;
  brandCoverage: number;
  citationRate: number;
  shareOfVoice: number;
  competitors: Array<{
    brand: string;
    isMainBrand: boolean;
    mentions: number;
    shareOfVoice: number;
    rank: number | null;
  }>;
  detectedBrands: Array<{ name: string; mentions: number }>;
  topCitedDomains: Array<{ domain: string; coverage: number }>;
}

function sanitize(
  stats: OtterlyBrandReportStats,
  report: OtterlyBrandReport,
): PublicSanitizedStats {
  const mainBrand =
    stats.competitorBrandsAnalysis.brandMentions.find((b) => b.isMainBrand) ??
    null;
  return {
    totalMentions: stats.summary.totalMentions,
    averageRank:
      stats.summary.averageRank != null
        ? Math.round(stats.summary.averageRank)
        : null,
    brandCoverage:
      mainBrand?.brandCoverage != null
        ? Math.round(mainBrand.brandCoverage)
        : Math.round(stats.summary.brandCoverage ?? 0),
    citationRate:
      mainBrand?.domainCoverage != null
        ? Math.round(mainBrand.domainCoverage)
        : Math.round(stats.summary.domainCoverage ?? 0),
    shareOfVoice: Math.round(stats.summary.shareOfVoice ?? 0),
    competitors: stats.competitorBrandsAnalysis.brandMentions.map((b) => ({
      brand: b.brand,
      isMainBrand: b.isMainBrand,
      mentions: b.mentions,
      shareOfVoice: Math.round(b.shareOfVoice ?? 0),
      rank: b.averageRank != null ? Math.round(b.averageRank) : null,
    })),
    detectedBrands: stats.detectedBrands.slice(0, 12).map((d) => ({
      name: d.name,
      mentions: d.mentions,
    })),
    topCitedDomains: (
      stats.allBrandsAnalysis.domainCoverageHistory[0]?.domains ?? []
    )
      .slice(0, 8)
      .map((d) => ({
        domain: d.domain,
        coverage: Math.round(d.coverage ?? 0),
      })),
    // Intentionally NOT included: report.id, account info, prompt list,
    // workspace IDs, anything that could leak the owner's tracking
    // config or be used to drive write requests against Otterly.
    // brandDomain comes from the report (caldwellrg.com) — surfaced
    // separately at the response level.
    ...{},
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return Response.json({ status: "not_found" } as PublicResponse);
  }

  const service = createServiceRoleClient();
  const { data: link } = await service
    .from("radar_share_links")
    .select("id, profile_id, label, is_active, expires_at, view_count")
    .eq("token", token)
    .maybeSingle();

  if (!link) {
    return Response.json({ status: "not_found" } as PublicResponse);
  }
  if (!link.is_active) {
    return Response.json({ status: "revoked" } as PublicResponse);
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return Response.json({ status: "expired" } as PublicResponse);
  }

  // Fire-and-forget view tracking — don't block the response on it.
  service
    .from("radar_share_links")
    .update({
      view_count: (link.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", link.id)
    .then(() => undefined);

  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("website_url")
    .eq("id", link.profile_id)
    .maybeSingle();
  const hostname = normalizeHostname(
    (profileRow?.website_url ?? null) as string | null,
  );
  if (!hostname) {
    return Response.json({ status: "no_data" } as PublicResponse);
  }

  try {
    const reportsList = await listBrandReports();
    const report = findReportForHostname(reportsList.items, hostname);
    if (!report) {
      return Response.json({ status: "no_data" } as PublicResponse);
    }

    const country = report.countries[0] ?? "us";
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .split("T")[0];

    const stats = await getBrandReportStats(report.id, {
      startDate,
      endDate,
      country,
    });

    const payload: PublicResponse = {
      status: "ready",
      brand: report.brand,
      brandDomain: report.brandDomain,
      label: link.label,
      stats: sanitize(stats, report),
    };
    return Response.json(payload);
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json({
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      } as PublicResponse);
    }
    return Response.json({
      status: "otterly_error",
      error: {
        message: e instanceof Error ? e.message : "Unknown error",
        status: 500,
      },
    } as PublicResponse);
  }
}
