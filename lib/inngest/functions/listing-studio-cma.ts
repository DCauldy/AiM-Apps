import { inngest } from "@/lib/inngest/client";
import { runCmaPipeline } from "@/lib/listing-studio/cma/pipeline";

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

type ListingStudioCmaEvent = {
  name: "listing-studio/cma.requested";
  data: {
    userId: string;
    listingId: string;
    useApi: boolean;
    useCsv: boolean;
    radius_mi?: number;
    months_back?: number;
  };
};

// ---------------------------------------------------------------------------
// Listing Studio CMA pipeline — Inngest function
//
// The heavy CMA path (RapidAPI pulls + grid math + two Claude calls).
// Concurrency capped to keep the RapidAPI quota predictable. Retries are
// disabled because the pipeline writes a `pipeline_error` row on its own
// failure path — Inngest retrying would just stamp duplicate failure rows.
// ---------------------------------------------------------------------------

export const listingStudioCma = inngest.createFunction(
  {
    id: "listing-studio-cma",
    name: "Listing Studio: CMA",
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
    const { userId, listingId, useApi, useCsv, radius_mi, months_back } = event.data;

    const result = await step.run("run-cma-pipeline", async () =>
      runCmaPipeline({
        userId,
        listingId,
        useApi,
        useCsv,
        radius_mi,
        months_back,
      }),
    );

    return {
      success: true,
      cmaRunId: result.cmaRunId,
      recommendedPriceCents: result.recommendedPriceCents,
      listingId,
    };
  },
);
