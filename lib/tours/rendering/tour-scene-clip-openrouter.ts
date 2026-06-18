import { getTourSceneCameraMotionLabel } from "@/lib/tours/scenes.core";
import { TourSceneClipRenderError } from "./tour-scene-clip-errors";
import type { ImageToVideoProvider, ImageToVideoProviderInput } from "./tour-scene-clips";

export type OpenRouterVideoImageUrlPart = {
  type: "image_url";
  image_url: { url: string };
};

export type OpenRouterFrameImage = OpenRouterVideoImageUrlPart & {
  frame_type: "first_frame";
};

export type OpenRouterVideoRequestBody = {
  model: string;
  prompt: string;
  duration: number;
  resolution: "720p";
  aspect_ratio: "9:16";
  generate_audio: false;
  frame_images: OpenRouterFrameImage[];
  input_references?: OpenRouterVideoImageUrlPart[];
};

type OpenRouterVideoJob = {
  id?: string;
  status?: string;
  polling_url?: string;
  error?: string;
  unsigned_urls?: string[];
};

export function createOpenRouterImageToVideoProvider(options: {
  apiKey: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): ImageToVideoProvider {
  const fetcher = options.fetcher ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 20_000;
  const maxPollAttempts = options.maxPollAttempts ?? 90;

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

      let submitResponse: Response;
      try {
        submitResponse = await fetcher("https://openrouter.ai/api/v1/videos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildOpenRouterSceneClipRequestBody({
            modelId: input.modelId,
            prompt,
            durationSeconds: providerDurationSeconds,
            sourceImageUrl: input.sourceImageUrl,
            secondarySourceImageUrls: input.secondarySourceImageUrls,
          })),
        });
      } catch (error) {
        console.error("OpenRouter image-to-video submit threw.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video request failed.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      if (!submitResponse.ok) {
        const responseText = await submitResponse.text().catch(() => "");
        console.error("OpenRouter image-to-video submit failed.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          status: submitResponse.status,
          responseText: truncateForLog(responseText),
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video request failed.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      const submitted = await submitResponse.json().catch(() => null) as OpenRouterVideoJob | null;
      console.log("OpenRouter image-to-video submit accepted.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        providerJobId: submitted?.id ?? null,
        status: submitted?.status ?? null,
      });
      const completed = await waitForOpenRouterVideoJob({
        job: submitted,
        apiKey: options.apiKey,
        fetcher,
        pollIntervalMs,
        maxPollAttempts,
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
      });
      const outputUrl = completed.unsigned_urls?.[0] ?? null;

      if (!outputUrl) {
        console.error("OpenRouter image-to-video completed without unsigned output URL.", {
          sceneId: input.scene.id,
          sceneTitle: input.scene.title,
          modelId: input.modelId,
          providerJobId: completed.id ?? null,
          status: completed.status ?? null,
        });
        throw new TourSceneClipRenderError(
          "OpenRouter image-to-video response did not include an unsigned output URL.",
          "SCENE_CLIP_PROVIDER_FAILED"
        );
      }

      console.log("OpenRouter image-to-video completed.", {
        sceneId: input.scene.id,
        sceneTitle: input.scene.title,
        modelId: input.modelId,
        providerJobId: completed.id ?? null,
        outputUrlHost: safeUrlHost(outputUrl),
      });

      return {
        outputUrl,
        downloadHeaders: outputUrl.startsWith("https://openrouter.ai/api/")
          ? { Authorization: `Bearer ${options.apiKey}` }
          : undefined,
        metadata: {
          providerJobId: completed.id ?? null,
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
  const rounded = Math.round(durationSeconds);
  if (!Number.isFinite(rounded)) {
    return 5;
  }
  return Math.max(1, rounded);
}

async function waitForOpenRouterVideoJob(input: {
  job: OpenRouterVideoJob | null;
  apiKey: string;
  fetcher: typeof fetch;
  pollIntervalMs: number;
  maxPollAttempts: number;
  sceneId: string;
  sceneTitle: string;
  modelId: string;
}): Promise<OpenRouterVideoJob> {
  let current = input.job;
  for (let attempt = 0; attempt <= input.maxPollAttempts; attempt += 1) {
    console.log("OpenRouter image-to-video poll status.", {
      sceneId: input.sceneId,
      sceneTitle: input.sceneTitle,
      modelId: input.modelId,
      providerJobId: current?.id ?? null,
      status: current?.status ?? null,
      attempt,
      maxPollAttempts: input.maxPollAttempts,
    });
    if (current?.status === "completed") {
      return current;
    }
    if (current?.status && ["failed", "cancelled", "expired"].includes(current.status)) {
      console.error("OpenRouter image-to-video terminal failure.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        status: current.status,
        error: current.error ?? null,
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video generation failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (!current?.id && !current?.polling_url) {
      console.error("OpenRouter image-to-video job missing poll target.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        status: current?.status ?? null,
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video response did not include a job id.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (attempt === input.maxPollAttempts) {
      break;
    }

    await sleep(input.pollIntervalMs);
    const pollingUrl = new URL(
      current.polling_url ?? `/api/v1/videos/${encodeURIComponent(current.id ?? "")}`,
      "https://openrouter.ai"
    );
    let response: Response;
    try {
      response = await input.fetcher(pollingUrl, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
      });
    } catch (error) {
      console.error("OpenRouter image-to-video poll threw.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video polling failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error("OpenRouter image-to-video poll failed.", {
        sceneId: input.sceneId,
        sceneTitle: input.sceneTitle,
        modelId: input.modelId,
        providerJobId: current.id ?? null,
        status: response.status,
        responseText: truncateForLog(responseText),
      });
      throw new TourSceneClipRenderError(
        "OpenRouter image-to-video polling failed.",
        "SCENE_CLIP_PROVIDER_FAILED"
      );
    }
    current = await response.json().catch(() => null) as OpenRouterVideoJob | null;
  }

  throw new TourSceneClipRenderError(
    "OpenRouter image-to-video generation timed out.",
    "SCENE_CLIP_PROVIDER_FAILED"
  );
}

function truncateForLog(value: string, maxLength = 1200): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeUrlHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
