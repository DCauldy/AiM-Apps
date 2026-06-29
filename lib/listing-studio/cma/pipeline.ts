import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import {
  fetchSoldComps,
  fetchMarketTrends,
  lookupProperty,
  fetchPropertyImages,
  type RawComp,
} from "@/lib/listing-studio/rapidapi";
import {
  filterComps,
  applyAdjustments,
  summarizeGrid,
  recommendPrice,
  compsCriteriaFromInput,
} from "@/lib/listing-studio/cma/adjustment-grid";
import {
  getSellerNarrativePrompt,
  getInternalMemoPrompt,
} from "@/lib/listing-studio/cma/prompts";
import { getListingStudioWriterModel } from "@/lib/openrouter";
import type {
  PropertyFacts,
  AdjustedComp,
  AdjustmentGridSummary,
} from "@/types/listing-studio";

// ============================================================
// CMA pipeline (deterministic grid + two Claude calls).
//
// v2 shape: pure-function over (subject, address) → CMA result. The
// caller (Wave 4's cma-deliver Inngest fn) loads the cma_clients row
// and passes property_facts + address directly. No DB lookup inside
// the pipeline — keeps it reusable across cadence + ad-hoc + tests.
//
// Persists the run to ls_cma_runs and returns the inserted id +
// recommended price for the caller to wire onto the
// cma_client_deliveries row.
//
// On unrecoverable failure inserts a placeholder ls_cma_runs row with
// pipeline_error set so caller can surface the failure to the agent.
// ============================================================

export interface RunCmaInput {
  /** Full street + city + state + ZIP. Used for the lookupProperty
   *  fallback when zpid is missing, and for the AI narrative prompts. */
  address: string;
  /** Subject property facts. zip / living_area_sqft / beds / baths are
   *  required; everything else improves quality but is not gating. */
  subject: PropertyFacts;
  /** Comp filter overrides. UI exposes these as advanced controls; the
   *  cadence pipeline uses the defaults. */
  radius_mi?: number;
  months_back?: number;
}

export interface RunCmaResult {
  cmaRunId: string;
  recommendedPriceCents: number;
  estimatedValueCents: number;
  marketableValueCents: number;
  /** Subject after the pipeline backfilled zpid + image_url. Callers
   *  that own a cma_clients row should merge this back onto
   *  property_facts so the landing page renders the MLS / Street View
   *  photo instead of falling through to the Mapbox map. */
  hydratedSubject: PropertyFacts;
}

export async function runCmaPipeline(input: RunCmaInput): Promise<RunCmaResult> {
  const supabase = createServiceRoleClient();
  const { address } = input;
  // Defensive copy — we mutate locally for zpid/image_url backfill but
  // shouldn't mutate the caller's PropertyFacts object.
  const subject: PropertyFacts = { ...input.subject };

  try {
    if (!subject.zip) {
      throw new Error("Subject is missing a ZIP code — cannot pull comps.");
    }
    if (!subject.living_area_sqft || !subject.beds || subject.baths == null) {
      throw new Error(
        "Subject is missing basic facts (sqft / beds / baths). Edit the client's property facts before running a CMA.",
      );
    }

    // 1. Resolve zpid — required for /similarSales + trend endpoints.
    //    Fall back to a fresh lookupProperty call when missing.
    let zpid = subject.zpid ?? null;
    if (!zpid) {
      const facts = await lookupProperty(address).catch(() => null);
      zpid = facts?.zpid ?? null;
    }
    if (!zpid) {
      throw new Error(
        "Couldn't resolve this address with the property data source. Verify the address on the client record.",
      );
    }
    subject.zpid = zpid;

    // 2. Best-effort subject hero image — populated for the landing page.
    //    Off-market homes get Street View; sold/active get an MLS photo.
    if (!subject.image_url) {
      const images = await fetchPropertyImages(zpid).catch(() => [] as string[]);
      if (images.length > 0) subject.image_url = images[0];
    }

    // 3. Pull comps.
    const apiComps: RawComp[] = await fetchSoldComps({
      zpid,
      zip: subject.zip,
      radius_mi: input.radius_mi ?? 1,
      months_back: input.months_back ?? 6,
      property_type: subject.property_type ?? undefined,
      subject_sqft: subject.living_area_sqft ?? undefined,
    });

    if (apiComps.length === 0) {
      throw new Error(
        "Property data source returned no comps for this ZIP + radius. Widen the radius or skip this delivery.",
      );
    }

    // 4. Filter + adjust.
    const criteria = {
      radius_mi: input.radius_mi ?? 1,
      months_back: input.months_back ?? 6,
      property_type: subject.property_type ?? null,
      subject_sqft: subject.living_area_sqft ?? null,
    };
    const filtered = filterComps(apiComps, subject, criteria);
    const adjusted: AdjustedComp[] = filtered.map((c) =>
      applyAdjustments(c, subject),
    );

    if (adjusted.length === 0) {
      throw new Error(
        "All comps were filtered out (radius/recency/sqft window too narrow). Widen the criteria.",
      );
    }

    const grid: AdjustmentGridSummary = summarizeGrid(adjusted, criteria);
    const recommendation = recommendPrice(grid);

    // 5. Market trends — best-effort; null on failure.
    const marketTrends = await fetchMarketTrends({
      zpid,
      zip: subject.zip,
    }).catch(() => null);

    // 6. Two Claude calls in parallel — narrative + memo.
    const promptInput = {
      address,
      subject,
      comps: adjusted,
      grid,
      recommendation,
      marketTrends,
      compsSource: "rapidapi" as const,
    };
    const sellerPrompt = getSellerNarrativePrompt(promptInput);
    const memoPrompt = getInternalMemoPrompt(promptInput);

    const [sellerResult, memoResult] = await Promise.all([
      generateText({
        model: getListingStudioWriterModel(),
        messages: [
          { role: "system", content: sellerPrompt.system },
          { role: "user", content: sellerPrompt.user },
        ],
        temperature: 0.55,
        maxOutputTokens: 2500,
      }),
      generateText({
        model: getListingStudioWriterModel(),
        messages: [
          { role: "system", content: memoPrompt.system },
          { role: "user", content: memoPrompt.user },
        ],
        temperature: 0.4,
        maxOutputTokens: 1500,
      }),
    ]);

    // 7. Persist. The canonical link from a run back to its delivery
    //    / client lives on cma_client_deliveries.cma_run_id (caller
    //    writes that row).
    const { data: inserted, error } = await supabase
      .from("ls_cma_runs")
      .insert({
        comps_source: "rapidapi",
        comps: adjusted,
        adjustment_grid: grid,
        appraised_value_cents: recommendation.appraised_value_cents,
        marketable_value_cents: recommendation.marketable_value_cents,
        recommended_price_cents: recommendation.recommended_price_cents,
        seller_narrative_md: sellerResult.text,
        internal_memo_md: memoResult.text,
        pipeline_error: null,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(`Failed to save CMA run: ${error?.message}`);
    }

    return {
      cmaRunId: inserted.id,
      recommendedPriceCents: recommendation.recommended_price_cents,
      estimatedValueCents: recommendation.appraised_value_cents,
      marketableValueCents: recommendation.marketable_value_cents,
      hydratedSubject: subject,
    };
  } catch (err) {
    // Best-effort placeholder row so the caller can surface the failure.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await supabase.from("ls_cma_runs").insert({
        comps_source: null,
        comps: null,
        adjustment_grid: null,
        appraised_value_cents: null,
        marketable_value_cents: null,
        recommended_price_cents: null,
        seller_narrative_md: null,
        internal_memo_md: null,
        pipeline_error: message.slice(0, 500),
        generated_at: new Date().toISOString(),
      });
    } catch {
      // Swallow placeholder failures — the thrown err is the source of truth.
    }
    throw err;
  }
}

export { compsCriteriaFromInput };
