import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  computeSphereSnapshot,
  type SphereSnapshot,
} from "@/lib/hyperlocal/sphere";

// ============================================================
// Hyperlocal sphere refresh — recompute the ZIP-level tally of a
// profile's CRM contacts that paints the map-first front door.
// Runs off the request path and reports genuine progress via run
// metadata (step + progress) so the landing page can stream a real
// "lighting up your sphere" experience over SSE.
// ============================================================

export interface SphereRefreshOutput {
  ok: boolean;
  /** Present when ok and the profile has a usable CRM connection. */
  snapshot?: SphereSnapshot;
  /** Set when the profile has no Hyperlocal CRM connection wired up. */
  noConnection?: boolean;
  error?: string;
}

export const hlSphereRefreshTask = task({
  id: "hl-sphere-refresh",
  queue: {
    name: "hl-sphere-refresh",
    concurrencyLimit: 5,
  },
  retry: { maxAttempts: 1 },
  maxDuration: 3 * 60,
  run: async (
    payload: { userId: string; profileId: string; connectionId?: string | null },
    { ctx },
  ): Promise<SphereRefreshOutput> => {
    metadata.set("product", "hyperlocal");
    metadata.set("userId", payload.userId);
    metadata.set("profileId", payload.profileId);
    metadata.set("triggerRunId", ctx.run.id);
    metadata.set("step", "connecting");
    metadata.set("message", "Connecting to your CRM…");
    metadata.set("progress", 4);

    logger.log("Hyperlocal sphere refresh starting", {
      profileId: payload.profileId,
    });

    try {
      const snapshot = await computeSphereSnapshot(
        payload.userId,
        payload.profileId,
        {
          connectionId: payload.connectionId,
          onProgress: ({ step, message, progress, contactsFetched, zipsFound }) => {
            metadata.set("step", step);
            metadata.set("message", message);
            metadata.set("progress", progress);
            if (typeof contactsFetched === "number") {
              metadata.set("contactsFetched", contactsFetched);
            }
            if (typeof zipsFound === "number") {
              metadata.set("zipsFound", zipsFound);
            }
          },
        },
      );

      if (!snapshot) {
        metadata.set("step", "done");
        metadata.set("progress", 100);
        return { ok: true, noConnection: true };
      }

      metadata.set("step", "done");
      metadata.set("progress", 100);
      logger.log("Hyperlocal sphere refresh finished", {
        profileId: payload.profileId,
        totalContacts: snapshot.total_contacts,
        zips: snapshot.zips.length,
      });
      return { ok: true, snapshot };
    } catch (err) {
      logger.error("hl-sphere-refresh failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
