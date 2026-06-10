import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import {
  fetchSoldComps,
  fetchMarketTrends,
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
  ListingRow,
  AdjustedComp,
  AdjustmentGridSummary,
} from "@/types/listing-studio";

// ============================================================
// CMA pipeline (deterministic grid + two Claude calls).
//
// Shared by:
//   - Dev path (sync invocation from the API route)
//   - Prod path (Inngest fn calls runCmaPipeline)
//
// On unrecoverable failure the function still inserts a placeholder
// ls_cma_runs row with `pipeline_error` set so the polling UI can
// surface what went wrong instead of spinning forever.
// ============================================================

export interface RunCmaInput {
  userId: string;
  listingId: string;
  /** Pull comps from RapidAPI. */
  useApi: boolean;
  /** Merge in the most recent CSV upload for this listing. */
  useCsv: boolean;
  /** Optional overrides — UI exposes these as advanced controls. */
  radius_mi?: number;
  months_back?: number;
}

export interface RunCmaResult {
  cmaRunId: string;
  recommendedPriceCents: number;
}

export async function runCmaPipeline(input: RunCmaInput): Promise<RunCmaResult> {
  const supabase = createServiceRoleClient();
  const { userId, listingId, useApi, useCsv } = input;

  try {
    // 1. Load listing + subject facts.
    const { data: listing } = await supabase
      .from("ls_listings")
      .select("*")
      .eq("id", listingId)
      .eq("user_id", userId)
      .single();

    if (!listing) throw new Error(`Listing ${listingId} not found`);
    const listingRow = listing as ListingRow;
    const subject = listingRow.property_facts ?? {};

    if (!subject.zip) {
      throw new Error("Listing is missing a ZIP code — cannot pull comps.");
    }
    if (!subject.living_area_sqft || !subject.beds || !subject.baths) {
      throw new Error(
        "Listing is missing basic facts (sqft / beds / baths). Edit the facts before running a CMA.",
      );
    }

    // 2. Pull comps from each enabled source.
    const sources: ("rapidapi" | "csv")[] = [];
    let allRaw: RawComp[] = [];

    if (useApi) {
      const apiComps = await fetchSoldComps({
        zip: subject.zip,
        radius_mi: input.radius_mi ?? 1,
        months_back: input.months_back ?? 6,
        property_type: subject.property_type ?? undefined,
        subject_sqft: subject.living_area_sqft ?? undefined,
      });
      allRaw = allRaw.concat(apiComps);
      if (apiComps.length > 0) sources.push("rapidapi");
    }

    if (useCsv) {
      const { data: upload } = await supabase
        .from("ls_comps_uploads")
        .select("parsed_rows")
        .eq("listing_id", listingId)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rows = (upload?.parsed_rows ?? []) as RawComp[];
      if (rows.length > 0) {
        allRaw = allRaw.concat(rows);
        sources.push("csv");
      }
    }

    if (allRaw.length === 0) {
      throw new Error(
        useCsv
          ? "No comps found — RapidAPI returned nothing and there's no CSV upload yet."
          : "RapidAPI returned no comps for this ZIP + radius. Widen the radius or upload a CSV.",
      );
    }

    const compsSource: "rapidapi" | "csv" | "both" =
      sources.length === 2 ? "both" : sources[0] ?? "rapidapi";

    // 3. Filter + adjust each comp.
    const criteria = {
      radius_mi: input.radius_mi ?? 1,
      months_back: input.months_back ?? 6,
      property_type: subject.property_type ?? null,
      subject_sqft: subject.living_area_sqft ?? null,
    };
    const filtered = filterComps(allRaw, subject, criteria);
    const adjusted: AdjustedComp[] = filtered.map((c) => applyAdjustments(c, subject));

    if (adjusted.length === 0) {
      throw new Error(
        "All comps were filtered out (radius/recency/sqft window too narrow). Widen the criteria and try again.",
      );
    }

    const grid: AdjustmentGridSummary = summarizeGrid(adjusted, criteria);
    const recommendation = recommendPrice(grid);

    // 4. Market trends — best-effort; null on failure (narrative just omits the section).
    const marketTrends = await fetchMarketTrends(subject.zip).catch(() => null);

    // 5. Two Claude calls — narrative + memo. Run in parallel; they have
    //    no dependencies on each other.
    const promptInput = {
      address: listingRow.address,
      subject,
      comps: adjusted,
      grid,
      recommendation,
      marketTrends,
      compsSource,
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

    // 6. Persist.
    const { data: inserted, error } = await supabase
      .from("ls_cma_runs")
      .insert({
        listing_id: listingId,
        comps_source: compsSource,
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
    };
  } catch (err) {
    // Best-effort placeholder row so the UI can surface the failure.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await supabase.from("ls_cma_runs").insert({
        listing_id: listingId,
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

// Re-export the helper so route handlers don't need a second import path.
export { compsCriteriaFromInput };
