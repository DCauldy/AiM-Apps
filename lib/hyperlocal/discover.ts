import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/hyperlocal/crm";
import {
  getPlatformCrmConnection,
  getAppCrmConnection,
  setAppCrmSyncState,
} from "@/lib/platform/connections";
import { filterDeliverable } from "@/lib/hyperlocal/email/validation";
import { identifyGeographies } from "@/lib/hyperlocal/geographies";
import {
  computeRequiredMlsExports,
  type MlsExportRequirement,
} from "@/lib/hyperlocal/mls/data-requirements";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import type { HlCampaign, NormalizedContact } from "@/types/hyperlocal";

// ============================================================
// runHlDiscover — fetch CRM contacts, bucket by geography, persist
// segments + a discovery cache blob. Pure async helper called by
// the Trigger.dev hlDiscoverTask wrapper.
//
// Returns a small summary plus the next-phase decision. The caller
// (the task wrapper) is responsible for chaining to the generate
// task when nextPhase === "generate".
// ============================================================

export type HlDiscoverNextPhase =
  | "awaiting_service_area"
  | "awaiting_mls"
  | "generate"
  | "failed";

export interface RunHlDiscoverResult {
  nextPhase: HlDiscoverNextPhase;
  contactsFetched: number;
  segmentsCount: number;
  pendingSegmentsCount: number;
  hasServiceArea: boolean;
  requirements: MlsExportRequirement[];
  /** Set when nextPhase === "failed". */
  failureReason?: string;
}

export async function runHlDiscover(runId: string): Promise<RunHlDiscoverResult> {
  const supabase = createServiceRoleClient();

  // ---- 1. Load run context ----
  const { data: runRow, error: runErr } = await supabase
    .from("hl_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !runRow) {
    throw new Error(`Run ${runId} not found: ${runErr?.message ?? ""}`);
  }
  if (!runRow.campaign_id) throw new Error("Run has no campaign_id");
  if (!runRow.crm_connection_id) {
    throw new Error("Run has no crm_connection_id");
  }

  // CRM auth lives on the shared platform_crm_connections row; the
  // Hyperlocal search-area filter + sync metadata live on the per-app
  // app_crm_connection_state row (Wave 9 connection layer).
  const [{ data: campaignRow }, crmConnection, appCrm] = await Promise.all([
    supabase
      .from("hl_campaigns")
      .select("*")
      .eq("id", runRow.campaign_id)
      .single(),
    getPlatformCrmConnection(
      supabase,
      runRow.user_id,
      runRow.crm_connection_id,
    ),
    getAppCrmConnection(
      supabase,
      runRow.user_id,
      "hyperlocal",
      runRow.crm_connection_id,
    ),
  ]);
  if (!campaignRow) throw new Error("Campaign not found");
  if (!crmConnection) throw new Error("CRM connection not found");

  const campaign = campaignRow as HlCampaign;

  // ---- 2. Fetch + filter + bucket + persist ----
  const connector = getConnector(crmConnection.platform);
  const fetched = await connector.fetchContacts(crmConnection, {
    limit: 25_000,
    filter: appCrm?.state.filter_config,
  });

  // Touch the Hyperlocal app-state sync metadata.
  await setAppCrmSyncState(supabase, "hyperlocal", crmConnection.id, {
    last_synced_at: new Date().toISOString(),
    last_error: null,
  });

  // Free in-house list hygiene — syntax + typo + MX. Drops dead
  // emails before they enter segmentation so the customer's Resend
  // bounce rate stays clean.
  const { deliverable: contacts, removed } = await filterDeliverable(fetched);
  if (removed.length > 0) {
    console.log(
      `[hl-discover] hygiene removed ${removed.length}/${fetched.length} contacts ` +
        `for run ${runId}`,
    );
  }

  const hasServiceArea =
    Array.isArray(campaign.service_area_zips) &&
    campaign.service_area_zips.length > 0;

  if (contacts.length === 0) {
    await supabase
      .from("hl_runs")
      .update({
        phase: "failed",
        error: "No contacts returned from CRM",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      nextPhase: "failed",
      contactsFetched: 0,
      segmentsCount: 0,
      pendingSegmentsCount: 0,
      hasServiceArea,
      requirements: [],
      failureReason: "no_contacts",
    };
  }

  // Bucket by geography — filter to service area if campaign has one set
  const rawBuckets = identifyGeographies(
    contacts,
    campaign,
    hasServiceArea ? campaign.service_area_zips : undefined,
  );

  // Pack-tier cap on segments per campaign.
  const usage = await getHyperlocalUsage(runRow.user_id);
  const segmentsCap = usage.segmentsPerCampaign;
  const buckets =
    segmentsCap === UNLIMITED || rawBuckets.length <= (segmentsCap as number)
      ? rawBuckets
      : [...rawBuckets]
          .sort((a, b) => b.contact_ids.length - a.contact_ids.length)
          .slice(0, segmentsCap as number);
  if (
    segmentsCap !== UNLIMITED &&
    rawBuckets.length > (segmentsCap as number)
  ) {
    console.log(
      `[hl-discover] segments cap (${segmentsCap}) — dropped ${
        rawBuckets.length - (segmentsCap as number)
      } of ${rawBuckets.length} buckets for run ${runId}`,
    );
  }

  if (buckets.length === 0) {
    await supabase
      .from("hl_runs")
      .update({
        phase: "failed",
        contacts_fetched: contacts.length,
        error:
          "Pulled contacts but none mapped to a segment. Check your campaign's segmentation setting and that contacts have addresses/search areas.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      nextPhase: "failed",
      contactsFetched: contacts.length,
      segmentsCount: 0,
      pendingSegmentsCount: 0,
      hasServiceArea,
      requirements: [],
      failureReason: "no_segments",
    };
  }

  // Write discovery cache to Supabase Storage (the generate phase
  // reads this back to know which recipient belongs to which segment)
  const contactsById: Record<string, NormalizedContact> = {};
  for (const c of contacts) contactsById[c.external_id] = c;
  const cache = {
    contacts: contactsById,
    segments: buckets.map((b) => ({
      geo_key: b.geo_key,
      seller_contact_ids: b.seller_contact_ids,
      buyer_contact_ids: b.buyer_contact_ids,
      contact_ids: b.contact_ids,
    })),
  };
  const path = `${runRow.user_id}/${runId}/discovery.json`;
  const { error: uploadError } = await supabase.storage
    .from("hyperlocal-uploads")
    .upload(path, JSON.stringify(cache), {
      contentType: "application/json",
      upsert: true,
    });
  if (uploadError && !uploadError.message.includes("Duplicate")) {
    throw new Error(`upload discovery.json: ${uploadError.message}`);
  }

  // Insert one hl_segments row per bucket
  const segmentRows = buckets.map((b) => ({
    run_id: runId,
    geo_key: b.geo_key,
    geo_label: b.geo_label,
    geo_type: b.geo_type,
    contact_count: b.contact_ids.length,
    seller_contact_count: b.seller_contact_ids.length,
    buyer_contact_count: b.buyer_contact_ids.length,
    status: b.below_min_size ? "ready" : "pending",
    rolled_up_into: b.rolled_up_into ?? null,
    below_min_size: b.below_min_size,
  }));
  const { error: segErr } = await supabase
    .from("hl_segments")
    .insert(segmentRows);
  if (segErr) throw new Error(`insert hl_segments: ${segErr.message}`);

  // Run counters
  await supabase
    .from("hl_runs")
    .update({
      contacts_fetched: contacts.length,
      segments_count: buckets.length,
    })
    .eq("id", runId);

  // Full-size segments that need market numbers.
  const pendingBuckets = buckets.filter((b) => !b.below_min_size);

  // ---- 2b. Auto-fill market data (Full report, no manual upload) ----
  //
  // Try to auto-fetch market numbers per ZIP from the Zillow market-data
  // provider (cached 24h). Segments we successfully fill are marked ready;
  // any we can't (no key, no data, or a non-ZIP geo) stay pending and fall
  // through to the manual MLS upload — the "use my own MLS data" override is
  // always available.
  const filledKeys = new Set<string>();
  if (hasServiceArea && pendingBuckets.length > 0) {
    const { getMarketMetricsForZip, isMarketDataAvailable } = await import(
      "@/lib/hyperlocal/market-data",
    );
    if (isMarketDataAvailable()) {
      const opts = {
        minPrice: campaign.price_range_low ?? null,
        maxPrice: campaign.price_range_high ?? null,
      };
      // Sequential — the provider is rate-limited and the client spaces calls.
      for (const b of pendingBuckets) {
        if (!/^\d{5}$/.test(b.geo_key)) continue; // only real ZIPs resolve
        const metrics = await getMarketMetricsForZip(b.geo_key, opts).catch(
          () => null,
        );
        if (!metrics) continue;
        const { error: updErr } = await supabase
          .from("hl_segments")
          .update({ mls_metrics: metrics, status: "ready" })
          .eq("run_id", runId)
          .eq("geo_key", b.geo_key);
        if (!updErr) filledKeys.add(b.geo_key);
      }
      if (filledKeys.size > 0) {
        console.log(
          `[hl-discover] auto-filled market data for ${filledKeys.size}/${pendingBuckets.length} segments (run ${runId})`,
        );
      }
    }
  }

  // Segments still needing data after auto-fill drive the manual-upload phase.
  const stillPendingBuckets = pendingBuckets.filter(
    (b) => !filledKeys.has(b.geo_key),
  );
  const requirements = computeRequiredMlsExports(stillPendingBuckets, campaign);

  // ---- 3. Transition phase ----
  //
  // Possible next states:
  //   - awaiting_service_area: campaign has no service_area_zips set,
  //       user must pick which ZIPs to send to from the discovered list
  //   - awaiting_mls: service area known + at least one full-size segment
  //       still needs market data (auto-fill missed it — manual fallback)
  //   - generate: service area known + every segment has data (auto-filled
  //       or sub-threshold) — no manual upload needed
  let nextPhase: HlDiscoverNextPhase;
  if (!hasServiceArea) {
    nextPhase = "awaiting_service_area";
  } else if (stillPendingBuckets.length > 0) {
    nextPhase = "awaiting_mls";
  } else {
    nextPhase = "generate";
  }

  await supabase
    .from("hl_runs")
    .update({
      phase: nextPhase,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    nextPhase,
    contactsFetched: contacts.length,
    segmentsCount: buckets.length,
    pendingSegmentsCount: stillPendingBuckets.length,
    hasServiceArea,
    requirements,
  };
}
