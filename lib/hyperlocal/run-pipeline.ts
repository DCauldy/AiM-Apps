import { tasks } from "@trigger.dev/sdk/v3";
import { inngest } from "@/lib/inngest/client";
import type { hlDiscoverTask, hlGenerateTask } from "@/triggers/hyperlocal-pipeline";

export async function triggerDiscover(runId: string): Promise<void> {
  await tasks.trigger<typeof hlDiscoverTask>("hl-discover", { runId });
}

export async function triggerGenerate(runId: string): Promise<void> {
  await tasks.trigger<typeof hlGenerateTask>("hl-generate", { runId });
}

export async function triggerSend(runId: string): Promise<void> {
  // hl-send + hl-send-one still on Inngest — port in the next change.
  await inngest.send({
    name: "hl/run.send.approved",
    data: { runId },
  });
}
