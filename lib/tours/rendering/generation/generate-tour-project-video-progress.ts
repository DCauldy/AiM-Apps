import type {
  GenerateTourProjectVideoInput,
  TourRenderProgressUpdate,
} from "./generate-tour-project-video.types";
import type { TourRenderRepository, TourRenderRun } from "../repositories/tour-render.repository";

export async function notifyProgress(
  input: GenerateTourProjectVideoInput,
  update: TourRenderProgressUpdate
): Promise<void> {
  try {
    await input.progress?.(update);
  } catch {
    // Trigger.dev metadata is operational only; Supabase remains the product state.
  }
}

export async function recordProgress(
  repository: TourRenderRepository,
  input: GenerateTourProjectVideoInput,
  update: TourRenderProgressUpdate
): Promise<TourRenderRun | null> {
  const run = await repository.updateProgress({
    runId: input.renderRunId,
    projectId: input.projectId,
    userId: input.userId,
    step: update.step,
    label: update.label,
    progressPercent: update.progressPercent,
    sceneClipCompletedCount: update.sceneClipCompletedCount,
    sceneClipTotalCount: update.sceneClipTotalCount,
  });

  await repository.appendEvent({
    runId: input.renderRunId,
    projectId: input.projectId,
    step: update.step,
    status: "running",
    safeMessage: update.message ?? update.label,
    metadata: update.metadata,
  });

  await notifyProgress(input, update);
  return run;
}

export async function markShellFailed(
  repository: TourRenderRepository,
  input: GenerateTourProjectVideoInput,
  safeMessage: string
): Promise<TourRenderRun | null> {
  const failed = await repository.markFailed({
    runId: input.renderRunId,
    projectId: input.projectId,
    userId: input.userId,
    step: "failed",
    label: "Failed",
    safeMessage,
  });

  await repository.appendEvent({
    runId: input.renderRunId,
    projectId: input.projectId,
    step: "failed",
    status: "failed",
    safeMessage,
  });

  await notifyProgress(input, {
    step: "failed",
    label: "Failed",
    progressPercent: failed?.progressPercent ?? 0,
    message: safeMessage,
  });

  return failed;
}
