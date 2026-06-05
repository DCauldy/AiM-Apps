import { inngest } from "@/lib/inngest/client";

export async function triggerDiscover(runId: string): Promise<void> {
  await inngest.send({
    name: "hl/run.discover.requested",
    data: { runId },
  });
}

export async function triggerGenerate(runId: string): Promise<void> {
  await inngest.send({
    name: "hl/run.generate.requested",
    data: { runId },
  });
}

export async function triggerSend(runId: string): Promise<void> {
  await inngest.send({
    name: "hl/run.send.approved",
    data: { runId },
  });
}
