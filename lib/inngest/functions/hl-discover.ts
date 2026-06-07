import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/hyperlocal/crm";
import { filterDeliverable } from "@/lib/hyperlocal/email/validation";
import { identifyGeographies } from "@/lib/hyperlocal/geographies";
import {
  computeRequiredMlsExports,
  type MlsExportRequirement,
} from "@/lib/hyperlocal/mls/data-requirements";
import type {
  HlCampaign,
  HlCrmConnection,
  NormalizedContact,
} from "@/types/hyperlocal";

type HlDiscoverEvent = {
  name: "hl/run.discover.requested";
  data: { runId: string };
};

/**
 * IMPORTANT: Inngest checkpoints every step's return value to its event store.
 * That value has a per-step output size cap (~4MB in cloud, varies in dev).
 * If we returned 20K+ contacts from a step (~10MB JSON), Inngest rejects the
 * checkpoint and the function appears to hang.
 *
 * So we do all the heavy work inside ONE step that writes the contact map to
 * Supabase Storage and returns ONLY a small summary. Subsequent steps re-read
 * from storage rather than passing big data through step return values.
 */

interface DiscoverSummary {
  contactsFetched: number;
  segmentsCount: number;
  pendingSegmentsCount: number;
  hasPending: boolean;
  hasServiceArea: boolean;       // campaign had service_area_zips set
  requirements: MlsExportRequirement[];
}

export const hlDiscover = inngest.createFunction(
  {
    id: "hl-discover",
    name: "Hyperlocal: Discover",
    retries: 1,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "hl/run.discover.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: HlDiscoverEvent["data"]; id?: string };
    step: any;
  }) => {
    const { runId } = event.data;
    const supabase = createServiceRoleClient();

    // ---- 1. Load run context (small) ----
    const ctx = await step.run("load-run-context", async () => {
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

      const [{ data: campaignRow }, { data: connRow }] = await Promise.all([
        supabase
          .from("hl_campaigns")
          .select("*")
          .eq("id", runRow.campaign_id)
          .single(),
        supabase
          .from("hl_crm_connections")
          .select("*")
          .eq("id", runRow.crm_connection_id)
          .single(),
      ]);
      if (!campaignRow) throw new Error("Campaign not found");
      if (!connRow) throw new Error("CRM connection not found");

      return {
        run: runRow,
        campaign: campaignRow as HlCampaign,
        crmConnection: connRow as HlCrmConnection,
      };
    });

    // ---- 2. Big monolithic step — fetch + bucket + persist segments + write
    //         contact map to storage. Returns ONLY a small summary so the
    //         step's checkpoint stays under Inngest's output size limit.
    const summary: DiscoverSummary = await step.run(
      "fetch-and-segment",
      async () => {
        const connector = getConnector(ctx.crmConnection.platform);
        const fetched = await connector.fetchContacts(ctx.crmConnection, {
          limit: 25_000,
        });

        // Touch CRM connection metadata
        await supabase
          .from("hl_crm_connections")
          .update({
            last_synced_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", ctx.crmConnection.id);

        // Free in-house list hygiene — syntax + typo + MX. Drops dead
        // emails before they enter segmentation so the customer's Resend
        // bounce rate stays clean. See lib/hyperlocal/email/validation.ts
        // for the strategy notes.
        const { deliverable: contacts, removed } = await filterDeliverable(fetched);
        if (removed.length > 0) {
          console.log(
            `[hl-discover] hygiene removed ${removed.length}/${fetched.length} contacts ` +
              `for run ${runId}`
          );
        }

        const hasServiceArea =
          Array.isArray(ctx.campaign.service_area_zips) &&
          ctx.campaign.service_area_zips.length > 0;

        if (contacts.length === 0) {
          return {
            contactsFetched: 0,
            segmentsCount: 0,
            pendingSegmentsCount: 0,
            hasPending: false,
            hasServiceArea,
            requirements: [],
          };
        }

        // Bucket by geography — filter to service area if campaign has one set
        const buckets = identifyGeographies(
          contacts,
          ctx.campaign,
          hasServiceArea ? ctx.campaign.service_area_zips : undefined
        );
        if (buckets.length === 0) {
          await supabase
            .from("hl_runs")
            .update({ contacts_fetched: contacts.length })
            .eq("id", runId);
          return {
            contactsFetched: contacts.length,
            segmentsCount: 0,
            pendingSegmentsCount: 0,
            hasPending: false,
            hasServiceArea,
            requirements: [],
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
        const path = `${ctx.run.user_id}/${runId}/discovery.json`;
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

        // Compute MLS requirements (only for full-size segments)
        const pendingBuckets = buckets.filter((b) => !b.below_min_size);
        const requirements = computeRequiredMlsExports(
          pendingBuckets,
          ctx.campaign
        );

        return {
          contactsFetched: contacts.length,
          segmentsCount: buckets.length,
          pendingSegmentsCount: pendingBuckets.length,
          hasPending: pendingBuckets.length > 0,
          hasServiceArea,
          requirements,
        };
      }
    );

    // ---- 3. Decide next phase from the summary ----
    if (summary.contactsFetched === 0) {
      await supabase
        .from("hl_runs")
        .update({
          phase: "failed",
          error: "No contacts returned from CRM",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { phase: "failed", reason: "no_contacts" };
    }
    if (summary.segmentsCount === 0) {
      await supabase
        .from("hl_runs")
        .update({
          phase: "failed",
          error:
            "Pulled contacts but none mapped to a segment. Check your campaign's segmentation setting and that contacts have addresses/search areas.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { phase: "failed", reason: "no_segments" };
    }

    // ---- 4. Transition phase ----
    //
    // Three possible next states:
    //   - awaiting_service_area: campaign has no service_area_zips set, user
    //       must pick which ZIPs to send to from the discovered list
    //   - awaiting_mls: service area known + at least one full-size segment
    //       needs market data
    //   - generate: service area known + every segment is sub-threshold (no
    //       MLS needed because Claude writes without numbers)
    let nextPhase: "awaiting_service_area" | "awaiting_mls" | "generate";
    if (!summary.hasServiceArea) {
      nextPhase = "awaiting_service_area";
    } else if (summary.hasPending) {
      nextPhase = "awaiting_mls";
    } else {
      nextPhase = "generate";
    }

    await step.run("transition-phase", async () => {
      await supabase
        .from("hl_runs")
        .update({
          phase: nextPhase,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    });

    if (nextPhase === "generate") {
      await step.sendEvent("dispatch-generate", {
        name: "hl/run.generate.requested",
        data: { runId },
      });
    }

    return {
      phase: nextPhase,
      segments_count: summary.segmentsCount,
      contacts_fetched: summary.contactsFetched,
      requirements: summary.requirements,
    };
  }
);
