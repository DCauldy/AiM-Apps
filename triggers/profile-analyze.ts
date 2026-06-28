import { logger, metadata, task } from "@trigger.dev/sdk/v3";

import {
  analyzeWebsite,
  WebsiteAnalysisError,
  type MagicProfileDraft,
} from "@/lib/profiles/website-analysis";

// ============================================================
// AI Magic onboarding — website → profile analysis as a background
// task. Reports genuine progress via run metadata (step + progress)
// so the client can stream a realistic loading experience over SSE
// instead of a faked bar. The heavy work (render + crawl + Opus +
// vision) runs here, off the request path.
// ============================================================

export interface AnalyzeProfileOutput {
  ok: boolean;
  error?: string;
  draft?: MagicProfileDraft;
  found?: string[];
  lowConfidence?: string[];
  pagesRead?: string[];
}

export const analyzeProfileTask = task({
  id: "profile-analyze",
  maxDuration: 180,
  run: async (
    payload: { url: string; userId: string },
  ): Promise<AnalyzeProfileOutput> => {
    metadata.set("product", "profile");
    metadata.set("userId", payload.userId);
    metadata.set("step", "Starting…");
    metadata.set("progress", 4);

    try {
      const result = await analyzeWebsite(payload.url, ({ step, progress }) => {
        metadata.set("step", step);
        metadata.set("progress", progress);
      });
      metadata.set("step", "Done");
      metadata.set("progress", 100);
      return { ok: true, ...result };
    } catch (err) {
      // User-friendly analysis errors come back as a normal (completed)
      // result so the SSE layer can surface the message; unexpected errors
      // bubble up and mark the run failed.
      if (err instanceof WebsiteAnalysisError) {
        metadata.set("step", "error");
        return { ok: false, error: err.message };
      }
      logger.error("profile-analyze failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
