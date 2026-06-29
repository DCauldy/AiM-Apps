import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { runCmaPipeline } from "@/lib/listing-studio/cma/pipeline";
import { lookupProperty } from "@/lib/listing-studio/rapidapi";
import type { CmaClient } from "@/types/cma";
import type { PlatformProfile } from "@/types/platform-profile";
import type { PropertyFacts } from "@/types/listing-studio";

export const dynamic = "force-dynamic";
// Pipeline + RapidAPI + 2x Claude calls — generous timeout for the
// first run. Subsequent runs reuse the most recent ls_cma_runs row.
export const maxDuration = 120;

interface CmaRunRow {
  id: string;
  comps: unknown;
  adjustment_grid: unknown;
  appraised_value_cents: number | null;
  marketable_value_cents: number | null;
  recommended_price_cents: number | null;
  seller_narrative_md: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

interface PreviewResponse {
  client: CmaClient;
  run: CmaRunRow | null;
  agent: PlatformProfile | null;
  prior: {
    recommended_price_cents: number | null;
    estimated_value_cents: number | null;
    delivered_at: string | null;
  } | null;
}

/**
 * POST /api/apps/listing-studio/clients/[id]/preview
 *
 * Runs the CMA pipeline against this client's address + property
 * facts (hydrating the facts from /property lookup if missing) and
 * returns the same payload the public landing page consumes. The
 * client-detail panel feeds the result straight into <LandingPage
 * previewMode />.
 *
 * Side-effects:
 *   - Persists hydrated property_facts back to cma_clients so a
 *     subsequent preview / real delivery doesn't re-look-up.
 *   - Inserts a new ls_cma_runs row (the pipeline does this; not
 *     dedupable across previews because runs aren't keyed by address).
 *
 * Body:
 *   { force?: boolean }  — when true, skip the recent-run reuse and
 *                          always re-run the pipeline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req
    .json()
    .catch(() => ({}))) as { force?: boolean };
  const force = body.force === true;

  const service = createServiceRoleClient();
  const { data: clientRow } = await service
    .from("cma_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!clientRow) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }
  let client = clientRow as CmaClient;
  const clientAddress = client.address;
  if (!clientAddress) {
    return Response.json(
      { error: "Client has no address — add one before previewing." },
      { status: 400 },
    );
  }

  // Hydrate property facts if the pipeline-required fields are missing.
  // Persist the result so we don't re-look-up on every preview.
  let facts: PropertyFacts = (client.property_facts ?? {}) as PropertyFacts;
  if (
    !facts.zip ||
    !facts.living_area_sqft ||
    !facts.beds ||
    facts.baths == null
  ) {
    const hydrated = await lookupProperty(clientAddress).catch(() => null);
    if (!hydrated) {
      return Response.json(
        {
          error:
            "Couldn't resolve this address with the property data source. Verify the address on the client record.",
        },
        { status: 422 },
      );
    }
    facts = { ...facts, ...hydrated } as PropertyFacts;
    await service
      .from("cma_clients")
      .update({
        property_facts: facts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", client.id);
    client = { ...client, property_facts: facts };
  }

  // Reuse the most recent successful run for this client (linked via
  // cma_client_deliveries.cma_run_id), unless the caller forced a fresh
  // pipeline run. Within ~30 days the comp data hasn't shifted enough
  // to justify another RapidAPI burn.
  let runRow: CmaRunRow | null = null;
  if (!force) {
    const { data: latestDelivery } = await service
      .from("cma_client_deliveries")
      .select("cma_run_id, delivered_at, created_at")
      .eq("client_id", client.id)
      .not("cma_run_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestDelivery?.cma_run_id) {
      const { data: cachedRun } = await service
        .from("ls_cma_runs")
        .select("*")
        .eq("id", latestDelivery.cma_run_id)
        .maybeSingle();
      if (cachedRun) {
        const age = Date.now() - new Date(cachedRun.generated_at).getTime();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (age < THIRTY_DAYS && !cachedRun.pipeline_error) {
          runRow = cachedRun as CmaRunRow;
        }
      }
    }
  }

  // No reusable run → run the pipeline fresh.
  if (!runRow) {
    try {
      const result = await runCmaPipeline({
        address: clientAddress,
        subject: facts,
      });
      // Persist the zpid + image_url the pipeline resolved so the
      // landing page can render the actual property photo on this
      // and every subsequent render instead of falling back to the
      // Mapbox satellite map.
      const mergedFacts: PropertyFacts = {
        ...facts,
        ...result.hydratedSubject,
      };
      await service
        .from("cma_clients")
        .update({
          property_facts: mergedFacts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.id);
      client = { ...client, property_facts: mergedFacts };
      const { data: freshRun } = await service
        .from("ls_cma_runs")
        .select("*")
        .eq("id", result.cmaRunId)
        .maybeSingle();
      runRow = (freshRun ?? null) as CmaRunRow | null;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pipeline failed";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  // Agent profile for branding + signature — same lookup as the public
  // landing-page route does.
  const targetProfileId = client.profile_id;
  const { data: agentRow } = targetProfileId
    ? await service
        .from("platform_profiles")
        .select("*")
        .eq("id", targetProfileId)
        .maybeSingle()
    : await service
        .from("platform_profiles")
        .select("*")
        .eq("user_id", client.user_id)
        .eq("is_default", true)
        .maybeSingle();

  // Prior delivery for the vs-last delta panel.
  const { data: prior } = await service
    .from("cma_client_deliveries")
    .select("recommended_price_cents, estimated_value_cents, delivered_at")
    .eq("client_id", client.id)
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const response: PreviewResponse = {
    client,
    run: runRow,
    agent: (agentRow ?? null) as PlatformProfile | null,
    prior: prior ?? null,
  };
  return Response.json(response);
}
