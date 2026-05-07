import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Radar Cleanup — Inngest function
// ---------------------------------------------------------------------------

export const radarCleanup = inngest.createFunction(
  {
    id: "radar-cleanup",
    name: "Radar Data Cleanup",
    retries: 1,
    triggers: [{ event: "radar/cleanup.requested" }],
  },
  async ({ step }) => {
    const deletedCount = await step.run("delete-old-results", async () => {
      const supabase = createServiceRoleClient();

      // Delete radar_results older than 12 months
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);
      const cutoff = cutoffDate.toISOString();

      // First count how many we'll delete
      const { count } = await supabase
        .from("radar_results")
        .select("id", { count: "exact", head: true })
        .lt("created_at", cutoff);

      // Then delete them
      const { error } = await supabase
        .from("radar_results")
        .delete()
        .lt("created_at", cutoff);

      if (error) {
        console.error("[Radar Cleanup] Failed to delete old results:", error);
        throw new Error(`Cleanup failed: ${error.message}`);
      }

      console.log(`[Radar Cleanup] Deleted ${count ?? 0} results older than 12 months`);
      return count ?? 0;
    });

    return { success: true, deletedCount };
  }
);
