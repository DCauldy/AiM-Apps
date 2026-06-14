import { inngest } from "@/lib/inngest/client";
import { discoverTopicsForUser } from "@/lib/blog-engine/discover-topics";

// Standalone topic discovery — triggered by the "Discover Topics" button
// on /apps/blog-engine/topics. Skips the slot reservation + blog
// generation steps in the main pipeline.
type TopicsDiscoverEvent = {
  name: "blog-engine/topics.discover.requested";
  data: { userId: string };
};

export const topicsDiscover = inngest.createFunction(
  {
    id: "blog-engine-topics-discover",
    name: "Blog Engine: Discover Topics",
    retries: 2,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "blog-engine/topics.discover.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: TopicsDiscoverEvent["data"]; id?: string };
    step: any;
  }) => {
    const { userId } = event.data;
    return await step.run("discover-and-score", async () => {
      return await discoverTopicsForUser(userId);
    });
  },
);
