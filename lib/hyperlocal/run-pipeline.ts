import { tasks } from "@trigger.dev/sdk/v3";
import type { hlDiscoverTask, hlGenerateTask } from "@/triggers/hyperlocal-pipeline";
import type { hlSendTask } from "@/triggers/hyperlocal-send";
import type { hlSphereRefreshTask } from "@/triggers/hyperlocal-sphere";

export async function triggerDiscover(runId: string): Promise<void> {
  await tasks.trigger<typeof hlDiscoverTask>("hl-discover", { runId });
}

/** Kick off a background recompute of a profile's sphere snapshot.
 *  Returns the Trigger.dev run id so the caller can stream progress. */
export async function triggerSphereRefresh(input: {
  userId: string;
  profileId: string;
  connectionId?: string | null;
}): Promise<string> {
  const handle = await tasks.trigger<typeof hlSphereRefreshTask>(
    "hl-sphere-refresh",
    input,
  );
  return handle.id;
}

export async function triggerGenerate(runId: string): Promise<void> {
  await tasks.trigger<typeof hlGenerateTask>("hl-generate", { runId });
}

export async function triggerSend(runId: string): Promise<void> {
  await tasks.trigger<typeof hlSendTask>("hl-send", { runId });
}
