// Inngest wrapper for the Listing Studio photo pipeline.
//
// Triggered by event `listing-studio/photos.process.requested`. The actual
// vision work + DB writes live in `lib/listing-studio/photos/pipeline.ts`
// — this file only handles event plumbing, retries, and error capture
// onto a captions_doc row (so the UI can surface the failure).

import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processPhotos } from "@/lib/listing-studio/photos/pipeline";

type LsPhotosEvent = {
  name: "listing-studio/photos.process.requested";
  data: {
    userId: string;
    listingId: string;
    /** Optional subset; null = all photos for the listing. */
    photoIds?: string[];
  };
};

export const listingStudioPhotos = inngest.createFunction(
  {
    id: "listing-studio-photos",
    name: "Listing Studio: Photo Processing",
    retries: 1,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "listing-studio/photos.process.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: LsPhotosEvent["data"]; id?: string };
    step: any;
  }) => {
    const { userId, listingId, photoIds } = event.data;

    return await step.run("process", async () => {
      try {
        const result = await processPhotos(
          userId,
          listingId,
          photoIds && photoIds.length > 0 ? photoIds : null,
        );
        return { processed: result.processed };
      } catch (err) {
        // Surface the error onto a captions_doc row so the UI shows it.
        const supabase = createServiceRoleClient();
        const message = err instanceof Error ? err.message : "Unknown error";
        const { data: existing } = await supabase
          .from("ls_outputs")
          .select("id")
          .eq("listing_id", listingId)
          .eq("type", "captions_doc")
          .maybeSingle();
        if (existing?.id) {
          await supabase
            .from("ls_outputs")
            .update({
              pipeline_error: message,
              generated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("ls_outputs").insert({
            listing_id: listingId,
            type: "captions_doc",
            variant: null,
            content: null,
            status: "draft",
            pipeline_error: message,
          });
        }
        throw err;
      }
    });
  },
);
