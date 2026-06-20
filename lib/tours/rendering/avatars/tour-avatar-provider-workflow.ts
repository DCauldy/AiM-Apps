import { createHeyGenAvatarProvider } from "./heygen-avatar-provider";
import {
  TourAvatarError,
  type HeyGenAvatarGenerationOptions,
  type HeyGenAvatarProvider,
  type HeyGenAvatarSource,
} from "./tour-avatar.types";

export async function generateHeyGenAvatarVideo(input: {
  source: Extract<HeyGenAvatarSource, { mode: "generate" }>;
  outputPath: string;
  apiKey: string;
  avatarId: string;
  generation: HeyGenAvatarGenerationOptions;
  provider?: HeyGenAvatarProvider;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<string> {
  if (!input.avatarId.trim()) {
    throw new TourAvatarError("HeyGen avatar id is required.", "MISSING_HEYGEN_AVATAR_ID");
  }

  const provider = input.provider ?? createHeyGenAvatarProvider();
  const created = await provider.createAvatarVideo({
    apiKey: input.apiKey,
    avatarId: input.avatarId,
    title: input.source.title,
    audioUrl: input.source.audioUrl,
    generation: input.generation,
  });
  const status = await waitForHeyGenAvatarVideo({
    apiKey: input.apiKey,
    videoId: created.videoId,
    provider,
    pollIntervalMs: input.pollIntervalMs,
    maxPollAttempts: input.maxPollAttempts,
    sleep: input.sleep,
  });
  const downloaded = await provider.downloadAvatarVideo({
    videoUrl: status.videoUrl,
    outputPath: input.outputPath,
  });
  return downloaded.avatarVideoPath;
}

export async function waitForHeyGenAvatarVideo(input: {
  apiKey: string;
  videoId: string;
  provider: Pick<HeyGenAvatarProvider, "getAvatarVideo">;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<{ videoUrl: string }> {
  const sleepImpl = input.sleep ?? sleep;
  const pollIntervalMs = input.pollIntervalMs ?? 20_000;
  const maxPollAttempts = input.maxPollAttempts ?? 90;

  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    if (attempt > 1) {
      await sleepImpl(pollIntervalMs);
    }

    const status = await input.provider.getAvatarVideo({
      apiKey: input.apiKey,
      videoId: input.videoId,
    });
    if (status.status === "completed") return { videoUrl: status.videoUrl };
    if (status.status === "failed") {
      throw new TourAvatarError(status.message, "HEYGEN_POLL_FAILED");
    }
  }

  throw new TourAvatarError(`HeyGen video timed out: ${input.videoId}`, "HEYGEN_POLL_FAILED");
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
