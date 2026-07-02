import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import { runHeatEnrich } from "@/lib/heat/enrich";

// ============================================================
// Heat enrichment task — the demand pass behind a search, off the
// request path (~600ms/listing under the provider rate limit).
// Reports real progress via run metadata so the board can stream a
// truthful loading state (same pattern as profile-analyze).
// ============================================================

export interface HeatEnrichOutput {
  ok: boolean;
  count: number;
}

export const heatEnrichTask = task({
  id: "heat-enrich",
  maxDuration: 300,
  run: async (payload: {
    searchId: string;
    userId: string;
  }): Promise<HeatEnrichOutput> => {
    metadata.set("product", "heat");
    metadata.set("userId", payload.userId);
    metadata.set("step", "Starting…");
    metadata.set("progress", 4);

    try {
      const result = await runHeatEnrich(payload.searchId, (step, progress) => {
        metadata.set("step", step);
        metadata.set("progress", progress);
      });
      return result;
    } catch (err) {
      logger.error("heat-enrich failed", {
        searchId: payload.searchId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Mark the search errored so the board can stop polling.
      const { createServiceRoleClient } = await import("@/lib/supabase/server");
      await createServiceRoleClient()
        .from("heat_searches")
        .update({
          status: "error",
          error: err instanceof Error ? err.message : "Enrichment failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.searchId);
      throw err;
    }
  },
});
