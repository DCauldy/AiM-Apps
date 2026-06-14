import { tasks } from "@trigger.dev/sdk/v3";
import type { hlDiscoverTask, hlGenerateTask } from "@/triggers/hyperlocal-pipeline";
import type { hlSendTask } from "@/triggers/hyperlocal-send";

export async function triggerDiscover(runId: string): Promise<void> {
  await tasks.trigger<typeof hlDiscoverTask>("hl-discover", { runId });
}

export async function triggerGenerate(runId: string): Promise<void> {
  await tasks.trigger<typeof hlGenerateTask>("hl-generate", { runId });
}

export async function triggerSend(runId: string): Promise<void> {
  await tasks.trigger<typeof hlSendTask>("hl-send", { runId });
}
