import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  TourAvatarError,
  type HeyGenAvatarProvider,
} from "./tour-avatar";

export function createHeyGenAvatarProvider(options: { fetch?: typeof fetch } = {}): HeyGenAvatarProvider {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async createAvatarVideo(input) {
      const response = await fetchImpl("https://api.heygen.com/v3/videos", {
        method: "POST",
        headers: {
          "x-api-key": input.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "avatar",
          avatar_id: input.avatarId,
          title: input.title,
          resolution: input.generation.resolution,
          aspect_ratio: input.generation.aspectRatio,
          fit: input.generation.fit,
          remove_background: input.generation.removeBackground,
          output_format: input.generation.outputFormat,
          audio_url: input.audioUrl,
          engine: input.generation.engineType ? { type: input.generation.engineType } : undefined,
        }),
      }).catch(() => null);

      if (!response?.ok) {
        throw new TourAvatarError("HeyGen avatar video creation failed.", "HEYGEN_CREATE_FAILED");
      }

      const payload = await response.json().catch(() => null);
      const videoId = payload?.data?.video_id ?? payload?.data?.id;
      if (typeof videoId !== "string" || !videoId.trim()) {
        throw new TourAvatarError("HeyGen create video response did not include a video id.", "HEYGEN_CREATE_FAILED");
      }

      return {
        videoId,
        metadata: { providerResponse: payload },
      };
    },
    async getAvatarVideo(input) {
      const response = await fetchImpl(`https://api.heygen.com/v3/videos/${encodeURIComponent(input.videoId)}`, {
        headers: { "x-api-key": input.apiKey },
      }).catch(() => null);

      if (!response?.ok) {
        throw new TourAvatarError("HeyGen avatar video status request failed.", "HEYGEN_POLL_FAILED");
      }

      const payload = await response.json().catch(() => null);
      const data = payload?.data ?? {};
      if (data.status === "completed" && typeof data.video_url === "string") {
        return {
          status: "completed",
          videoUrl: data.video_url,
          metadata: { providerResponse: payload },
        };
      }
      if (data.status === "failed") {
        return {
          status: "failed",
          message: `${data.failure_code ?? ""} ${data.failure_message ?? ""}`.trim() || "HeyGen avatar video failed.",
          metadata: { providerResponse: payload },
        };
      }
      return {
        status: "pending",
        metadata: { providerResponse: payload },
      };
    },
    async downloadAvatarVideo(input) {
      const outputPath = path.resolve(input.outputPath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      const response = await fetchImpl(input.videoUrl).catch(() => null);
      if (!response?.ok) {
        throw new TourAvatarError("HeyGen avatar video download failed.", "HEYGEN_DOWNLOAD_FAILED");
      }
      await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
      return { avatarVideoPath: outputPath };
    },
  };
}
