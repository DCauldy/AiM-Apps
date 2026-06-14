import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/apps/hyperlocal/runs/[id]/mls-snapshot-status
//
// For each pending segment on this run, report whether the profile
// already has recent market snapshots covering that geo. The MLS
// requirements card uses this to tell the agent "you already have
// fresh data for ZIP 37027 — only export the remaining ZIPs" —
// critical UX for MLS systems with low per-export caps.
//
// Freshness buckets:
//   fresh    — latest snapshot is in the current month or last
//   stale    — latest snapshot is 2–11 months old
//   missing  — no snapshots at all for this geo on this profile
// ============================================================

interface SegmentSnapshotStatus {
  segment_id: string;
  geo_key: string;
  geo_label: string | null;
  freshness: "fresh" | "stale" | "missing";
  latest_period: { year: number; month: number } | null;
  earliest_period: { year: number; month: number } | null;
  month_count: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();

  // Load the run + its profile + parent campaign (for filter spec).
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, profile_id, campaign_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (!run.profile_id) {
    return Response.json({ segments: [], campaign: null });
  }

  const { data: campaign } = run.campaign_id
    ? await service
        .from("hl_campaigns")
        .select("property_type_filters, price_range_low, price_range_high")
        .eq("id", run.campaign_id)
        .maybeSingle()
    : { data: null };

  const { data: segments } = await service
    .from("hl_segments")
    .select("id, geo_key, geo_label, status, below_min_size")
    .eq("run_id", id)
    .in("status", ["pending", "skipped"]);

  const pendingSegs = (segments ?? []).filter((s) => !s.below_min_size);
  if (pendingSegs.length === 0) {
    return Response.json({ segments: [] });
  }

  // One snapshot query, filtered to the geo_keys we care about.
  const geoKeys = pendingSegs.map((s) =>
    String(s.geo_key).trim().toLowerCase().split("-")[0],
  );
  const { data: snapshotRows } = await service
    .from("hl_market_snapshots")
    .select("geo_key, period_year, period_month")
    .eq("profile_id", run.profile_id)
    .in("geo_key", geoKeys);

  // Bucket snapshots by normalized geo_key.
  interface PeriodBucket {
    earliest: { year: number; month: number };
    latest: { year: number; month: number };
    count: number;
  }
  const byGeo = new Map<string, PeriodBucket>();
  for (const row of snapshotRows ?? []) {
    const k = String(row.geo_key).trim().toLowerCase().split("-")[0];
    const period = { year: row.period_year, month: row.period_month };
    const existing = byGeo.get(k);
    if (!existing) {
      byGeo.set(k, { earliest: period, latest: period, count: 1 });
      continue;
    }
    existing.count += 1;
    if (compare(period, existing.latest) > 0) existing.latest = period;
    if (compare(period, existing.earliest) < 0) existing.earliest = period;
  }

  // Anything in the last 31 days is "fresh." Use the latest snapshot
  // period's first-of-month as a coarse but correct proxy.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const result: SegmentSnapshotStatus[] = pendingSegs.map((seg) => {
    const k = String(seg.geo_key).trim().toLowerCase().split("-")[0];
    const bucket = byGeo.get(k);
    if (!bucket) {
      return {
        segment_id: seg.id,
        geo_key: seg.geo_key,
        geo_label: seg.geo_label ?? null,
        freshness: "missing",
        latest_period: null,
        earliest_period: null,
        month_count: 0,
      };
    }
    // "fresh" = covers current OR prior month. The renderer's "this
    // month vs last month" comparison needs at least one of those.
    const monthsBehind = monthsBetween(
      bucket.latest,
      { year: currentYear, month: currentMonth },
    );
    const freshness: "fresh" | "stale" =
      monthsBehind <= 1 ? "fresh" : "stale";
    return {
      segment_id: seg.id,
      geo_key: seg.geo_key,
      geo_label: seg.geo_label ?? null,
      freshness,
      latest_period: bucket.latest,
      earliest_period: bucket.earliest,
      month_count: bucket.count,
    };
  });

  return Response.json({
    segments: result,
    campaign: campaign
      ? {
          property_type_filters: campaign.property_type_filters ?? [],
          price_range_low: campaign.price_range_low ?? null,
          price_range_high: campaign.price_range_high ?? null,
        }
      : null,
  });
}

function compare(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function monthsBetween(
  earlier: { year: number; month: number },
  later: { year: number; month: number },
): number {
  return (later.year - earlier.year) * 12 + (later.month - earlier.month);
}
