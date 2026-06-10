import { inngest } from "@/lib/inngest/client";
import { runCmaPipeline } from "@/lib/listing-studio/cma/pipeline";
import type { PropertyFacts } from "@/types/listing-studio";

// ---------------------------------------------------------------------------
// CMA pipeline — Inngest function (v2: cadence-driven delivery)
//
// Triggered by Wave 4's cma-deliver step. The deliver fn loads the
// cma_clients row, hands the subject facts + address to this function,
// then writes the resulting cma_run_id onto cma_client_deliveries.
//
// Concurrency capped to keep RapidAPI quota predictable across bursts
// (e.g. an agent enrolling 100 clients triggers a staggered backfill).
// Retries are off because runCmaPipeline writes a pipeline_error row on
// failure — Inngest retrying would just stamp duplicate failure rows.
// ---------------------------------------------------------------------------

type ListingStudioCmaEvent = {
  name: "listing-studio/cma.requested";
  data: {
    userId: string;
    /** Caller-supplied correlation id so the deliver fn can match the
     *  result back to the row that asked for it. */
    requestId: string;
    address: string;
    subject: PropertyFacts;
    radius_mi?: number;
    months_back?: number;
  };
};

export const listingStudioCma = inngest.createFunction(
  {
    id: "listing-studio-cma",
    name: "CMA: pipeline",
    retries: 0,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "listing-studio/cma.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: ListingStudioCmaEvent["data"]; id?: string };
    step: any;
  }) => {
    const { requestId, address, subject, radius_mi, months_back } = event.data;

    const result = await step.run("run-cma-pipeline", async () =>
      runCmaPipeline({ address, subject, radius_mi, months_back }),
    );

    return {
      success: true,
      requestId,
      cmaRunId: result.cmaRunId,
      recommendedPriceCents: result.recommendedPriceCents,
      estimatedValueCents: result.estimatedValueCents,
      marketableValueCents: result.marketableValueCents,
    };
  },
);
