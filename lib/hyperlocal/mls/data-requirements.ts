import type { SegmentBucket } from "@/lib/hyperlocal/geographies";
import type { HlCampaign } from "@/types/hyperlocal";

export interface MlsExportRequirement {
  geo_key: string;
  geo_label: string;
  contact_count: number;
  suggested_filters: {
    status: string[];
    property_types?: string[];
    price_range?: { low?: number; high?: number };
    sold_lookback_days: number;
    active_lookback_days: number;
  };
  description: string;  // human-readable "tell me what to pull" line
}

/**
 * Given the segments from Phase 1, produce a per-segment description of what
 * MLS data the user needs to upload before Phase 2 can run.
 */
export function computeRequiredMlsExports(
  segments: SegmentBucket[],
  campaign: Pick<HlCampaign, "property_type_filters" | "price_range_low" | "price_range_high">
): MlsExportRequirement[] {
  return segments
    .filter((s) => s.status === "pending")
    .map((s) => {
      const filters = {
        status: ["sold", "active", "pending"],
        property_types:
          campaign.property_type_filters?.length > 0
            ? campaign.property_type_filters
            : undefined,
        price_range:
          campaign.price_range_low || campaign.price_range_high
            ? {
                low: campaign.price_range_low ?? undefined,
                high: campaign.price_range_high ?? undefined,
              }
            : undefined,
        sold_lookback_days: 180,
        active_lookback_days: 30,
      };

      const propPhrase = filters.property_types
        ? filters.property_types.join(", ")
        : "all property types";
      const pricePhrase = filters.price_range
        ? ` priced ${formatMoney(filters.price_range.low)}–${formatMoney(filters.price_range.high)}`
        : "";

      return {
        geo_key: s.geo_key,
        geo_label: s.geo_label,
        contact_count: s.contact_ids.length,
        suggested_filters: filters,
        description: `For ${s.geo_label} (${s.contact_ids.length} contacts): export sold + active + pending listings from the past 180 days, ${propPhrase}${pricePhrase}.`,
      };
    });
}

function formatMoney(n?: number): string {
  if (!n) return "any";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}
