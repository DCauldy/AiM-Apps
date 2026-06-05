import type {
  HlCampaign,
  NormalizedContact,
  SegmentationType,
} from "@/types/hyperlocal";

export interface SegmentBucket {
  geo_key: string;            // canonical key (e.g. "37027")
  geo_label: string;          // display name (may be same as geo_key)
  geo_type: SegmentationType;
  seller_contact_ids: string[];   // contacts whose home matches this geo
  buyer_contact_ids: string[];    // contacts whose search_area matches
  contact_ids: string[];          // union, deduped
  rolled_up_into?: string;
  status: "pending" | "rolled_up" | "skipped";
  below_min_size: boolean;        // flagged in UI as "low confidence" but still processed
}

/**
 * Identify geographic segments from a set of contacts, applying a campaign's
 * segmentation rules and (optionally) a service-area filter.
 *
 * When `serviceAreaZips` is provided, ONLY contacts whose home address or
 * search area lands in one of those ZIPs are bucketed. Everyone else is
 * dropped at this stage (no segment created), so we never waste tokens on
 * out-of-market ZIPs.
 *
 * When `serviceAreaZips` is empty/undefined, every ZIP gets its own bucket
 * and the user is expected to pick from them in the awaiting_service_area
 * phase.
 */
export function identifyGeographies(
  contacts: NormalizedContact[],
  campaign: Pick<HlCampaign, "segmentation" | "min_segment_size" | "lens">,
  serviceAreaZips?: string[]
): SegmentBucket[] {
  const buckets = new Map<string, SegmentBucket>();

  // Normalize the service area for lookup
  const allowedSet =
    serviceAreaZips && serviceAreaZips.length > 0
      ? new Set(serviceAreaZips.map(normalizeKey))
      : null;
  const inServiceArea = (key: string) =>
    allowedSet === null ? true : allowedSet.has(key);

  for (const c of contacts) {
    // Seller-side geo: from home_address
    if (campaign.lens !== "buyer") {
      const homeKey = extractHomeGeo(c, campaign.segmentation);
      if (homeKey && inServiceArea(homeKey)) {
        const b = ensureBucket(buckets, homeKey, campaign.segmentation);
        b.seller_contact_ids.push(c.external_id);
      }
    }

    // Buyer-side geo: from search_areas
    if (campaign.lens !== "seller") {
      for (const area of c.search_areas) {
        const key = normalizeKey(area);
        if (!key || !inServiceArea(key)) continue;
        const b = ensureBucket(buckets, key, campaign.segmentation);
        b.buyer_contact_ids.push(c.external_id);
      }
    }
  }

  // Dedupe contact_ids per bucket (a contact may appear in both seller and
  // buyer lists for the same geo)
  for (const b of buckets.values()) {
    b.contact_ids = Array.from(
      new Set([...b.seller_contact_ids, ...b.buyer_contact_ids])
    );
  }

  // Flag sub-threshold segments so the UI can warn — DON'T skip them.
  // User explicitly opted into "generate for all, flag low-confidence."
  const minSize = Math.max(1, campaign.min_segment_size ?? 3);
  for (const b of buckets.values()) {
    if (b.contact_ids.length < minSize) {
      b.below_min_size = true;
    }
  }

  return Array.from(buckets.values()).sort(
    (a, b) => b.contact_ids.length - a.contact_ids.length
  );
}

function ensureBucket(
  map: Map<string, SegmentBucket>,
  geo_key: string,
  geo_type: SegmentationType
): SegmentBucket {
  let b = map.get(geo_key);
  if (!b) {
    b = {
      geo_key,
      geo_label: geo_key,
      geo_type,
      seller_contact_ids: [],
      buyer_contact_ids: [],
      contact_ids: [],
      status: "pending",
      below_min_size: false,
    };
    map.set(geo_key, b);
  }
  return b;
}

function extractHomeGeo(
  contact: NormalizedContact,
  segmentation: SegmentationType
): string | null {
  const h = contact.home_address;
  if (!h) return null;
  switch (segmentation) {
    case "zip":
      return h.zip ? normalizeKey(h.zip) : null;
    case "city":
      return h.city ? normalizeKey(h.city) : null;
    case "county":
      // Counties aren't stored separately in normalized contacts; users would
      // need to provide via a tag/field. Fall back to city for now.
      return h.city ? normalizeKey(h.city) : null;
    case "subdivision":
    case "neighborhood":
    case "custom":
      return null;  // requires CRM tag/field — handled via search_areas
  }
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
