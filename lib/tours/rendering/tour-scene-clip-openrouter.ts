import { getTourSceneCameraMotionLabel } from "@/lib/tours/scenes.core";
import { TourSceneClipRenderError } from "./tour-scene-clip-errors";
import type { ImageToVideoProvider, ImageToVideoProviderInput } from "./tour-scene-clips";
import { openRouterApps } from "@/lib/openrouter/apps";
import { createOpenRouterClient } from "@/lib/openrouter/client";
import { isOpenRouterError } from "@/lib/openrouter/errors";
import type { OpenRouterVideoRequestBody } from "@/lib/openrouter/types";

export function createOpenRouterImageToVideoProvider(options: {
  apiKey: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  appInfo?: {
    referer?: string;
    title?: string;
  };
}): ImageToVideoProvider {
  const pollIntervalMs = options.pollIntervalMs ?? 20_000;
  const maxPollAttempts = options.maxPollAttempts ?? 90;
  const client = createOpenRouterClient({
    apiKey: options.apiKey,
    fetcher: options.fetcher,
    app: {
      title: options.appInfo?.title ?? openRouterApps.tours.title,
      referer: options.appInfo?.referer ?? openRouterApps.tours.referer,
    },
  });

  return {
    async renderSceneClip(input) {
      if (!options.apiKey) {
        throw new TourSceneClipRenderError(
          "OpenRouter API key is required for image-to-video rendering.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      const prompt = buildOpenRouterSceneClipPrompt(input);
      const providerDurationSeconds = normalizeOpenRouterVideoDuration(input.durationSeconds);
      console.log("OpenRouter image-to-video submit started.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        durationSeconds: input.durationSeconds,
        providerDurationSeconds,
      });

      const requestBody = buildOpenRouterSceneClipRequestBody({
        modelId: input.modelId,
        prompt,
        durationSeconds: providerDurationSeconds,
        sourceImageUrl: input.sourceImageUrl,
        secondarySourceImageUrls: input.secondarySourceImageUrls,
      });
      let rendered;
      try {
        rendered = await client.video.render({
          operation: "tour.scene_clip.render",
          body: requestBody,
          pollIntervalMs,
          maxPollAttempts,
        });
      } catch (error) {
        console.error("OpenRouter image-to-video failed.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw new TourSceneClipRenderError(
          isOpenRouterError(error)
            ? error.message
            : "OpenRouter image-to-video request failed.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      const outputUrl = rendered.outputUrls[0]!;

      console.log("OpenRouter image-to-video completed.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        providerJobId: rendered.id,
        outputUrlHost: safeUrlHost(outputUrl),
      });

      return {
        outputUrl,
        downloadHeaders: outputUrl.startsWith("https://openrouter.ai/api/")
          ? { Authorization: `Bearer ${options.apiKey}` }
          : undefined,
        metadata: {
          providerJobId: rendered.id,
          requestedDurationSeconds: input.durationSeconds,
          providerRequestedDurationSeconds: providerDurationSeconds,
          prompt,
        },
      };
    },
  };
}

export function buildOpenRouterSceneClipPrompt(input: ImageToVideoProviderInput): string {
  const cameraMotion =
    input.scene.cameraMotion === "auto"
      ? "Choose the strongest camera motion for an Instagram real-estate hook based on the primary first-frame image"
      : getTourSceneCameraMotionLabel(input.scene.cameraMotion);
  const hasSecondaryReferences = input.secondarySourceImageUrls.length > 0;
  const secondaryReferenceInstruction = hasSecondaryReferences
    ? [
        "Secondary reference images are provided only as additional room/property context for more dynamic but truthful camera motion.",
        "Use them to understand adjacent details, depth, materials, and spatial continuity, but keep the generated clip anchored to the primary first-frame image.",
      ].join(" ")
    : null;

  return [
    cameraMotion,
    `through ${input.scene.title}.`,
    secondaryReferenceInstruction,
    "Preserve all visible property details exactly.",
    "Do not invent or borrow objects, rooms, fixtures, doors, windows, openings, light sources, or architectural details from secondary references unless they are consistent with the primary first-frame image.",
    "Do not add or remove rooms, fixtures, doors, windows, openings, light sources, or architectural details.",
  ].filter(Boolean).join(" ");
}

export function buildOpenRouterSceneClipRequestBody(input: {
  modelId: string;
  prompt: string;
  durationSeconds: number;
  sourceImageUrl: string;
  secondarySourceImageUrls: string[];
}): OpenRouterVideoRequestBody {
  const body: OpenRouterVideoRequestBody = {
    model: input.modelId,
    prompt: input.prompt,
    duration: input.durationSeconds,
    resolution: "720p",
    aspect_ratio: "9:16",
    generate_audio: false,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: input.sourceImageUrl },
        frame_type: "first_frame",
      },
    ],
  };

  if (input.secondarySourceImageUrls.length > 0) {
    body.input_references = input.secondarySourceImageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
  }

  return body;
}

function normalizeOpenRouterVideoDuration(durationSeconds: number): number {
  const roundedUp = Math.ceil(durationSeconds);
  if (!Number.isFinite(roundedUp)) {
    return 5;
  }
  return Math.max(1, roundedUp);
}

function safeUrlHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}
