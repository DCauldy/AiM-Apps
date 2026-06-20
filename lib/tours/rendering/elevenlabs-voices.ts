import type { ElevenLabsDigitalTwinVoice } from "../integration-picker-options";

export type { ElevenLabsDigitalTwinVoice } from "../integration-picker-options";

type ElevenLabsVoiceSearchResponse = {
  voices?: unknown[];
  has_more?: boolean;
  next_page_token?: string | null;
};

type ElevenLabsVoiceSearchVoice = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  preview_url?: unknown;
  labels?: unknown;
  fine_tuning?: {
    state?: Record<string, unknown>;
  };
};

const DIGITAL_TWIN_VOICE_CATEGORIES = ["cloned", "professional"] as const;
const MAX_VOICE_PAGES_PER_CATEGORY = 5;

export class ElevenLabsVoicesError extends Error {
  constructor(
    message: string,
    readonly code: "ELEVENLABS_VOICES_FAILED" | "ELEVENLABS_VOICES_RESPONSE_INVALID"
  ) {
    super(message);
    this.name = "ElevenLabsVoicesError";
  }
}

export async function listElevenLabsDigitalTwinVoices(input: {
  apiKey: string;
  fetch?: typeof fetch;
}): Promise<ElevenLabsDigitalTwinVoice[]> {
  const fetchImpl = input.fetch ?? fetch;
  const voicesById = new Map<string, ElevenLabsDigitalTwinVoice>();

  for (const category of DIGITAL_TWIN_VOICE_CATEGORIES) {
    let nextPageToken: string | null = null;
    for (let page = 0; page < MAX_VOICE_PAGES_PER_CATEGORY; page += 1) {
      const payload = await fetchElevenLabsVoicesPage({
        apiKey: input.apiKey,
        fetch: fetchImpl,
        category,
        nextPageToken,
      });

      for (const voice of payload.voices ?? []) {
        const normalized = normalizeDigitalTwinVoice(voice);
        if (normalized) {
          voicesById.set(normalized.id, normalized);
        }
      }

      if (!payload.has_more || !payload.next_page_token) {
        break;
      }
      nextPageToken = payload.next_page_token;
    }
  }

  return [...voicesById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchElevenLabsVoicesPage(input: {
  apiKey: string;
  fetch: typeof fetch;
  category: (typeof DIGITAL_TWIN_VOICE_CATEGORIES)[number];
  nextPageToken: string | null;
}): Promise<ElevenLabsVoiceSearchResponse> {
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("voice_type", "personal");
  url.searchParams.set("category", input.category);
  url.searchParams.set("include_total_count", "false");
  url.searchParams.set("sort", "name");
  url.searchParams.set("sort_direction", "asc");
  if (input.nextPageToken) {
    url.searchParams.set("next_page_token", input.nextPageToken);
  }

  let response: Response;
  try {
    response = await input.fetch(url, {
      headers: {
        "xi-api-key": input.apiKey,
      },
    });
  } catch {
    throw new ElevenLabsVoicesError(
      "Could not load ElevenLabs voices.",
      "ELEVENLABS_VOICES_FAILED"
    );
  }

  if (!response.ok) {
    throw new ElevenLabsVoicesError(
      "Could not load ElevenLabs voices.",
      "ELEVENLABS_VOICES_FAILED"
    );
  }

  const payload = await response.json().catch(() => null);
  if (!isElevenLabsVoiceSearchResponse(payload)) {
    throw new ElevenLabsVoicesError(
      "ElevenLabs voices response was invalid.",
      "ELEVENLABS_VOICES_RESPONSE_INVALID"
    );
  }

  return payload;
}

function normalizeDigitalTwinVoice(voice: unknown): ElevenLabsDigitalTwinVoice | null {
  if (!voice || typeof voice !== "object") return null;
  const value = voice as ElevenLabsVoiceSearchVoice;
  if (typeof value.voice_id !== "string" || typeof value.name !== "string") return null;
  if (value.category !== "cloned" && value.category !== "professional") return null;

  return {
    id: value.voice_id,
    name: value.name,
    category: value.category,
    description: typeof value.description === "string" ? value.description : null,
    previewUrl: typeof value.preview_url === "string" ? value.preview_url : null,
    labels: normalizeVoiceLabels(value.labels),
    fineTuningState: getFineTuningState(value.fine_tuning?.state),
  };
}

function normalizeVoiceLabels(labels: unknown): Record<string, string> {
  if (!labels || typeof labels !== "object") return {};
  return Object.fromEntries(
    Object.entries(labels).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
}

function getFineTuningState(state: Record<string, unknown> | undefined): string | null {
  if (!state) return null;
  const fineTunedState = Object.values(state).find((value) => typeof value === "string");
  return typeof fineTunedState === "string" ? fineTunedState : null;
}

function isElevenLabsVoiceSearchResponse(
  payload: unknown
): payload is ElevenLabsVoiceSearchResponse {
  if (!payload || typeof payload !== "object") return false;
  const response = payload as ElevenLabsVoiceSearchResponse;
  return (
    (response.voices === undefined || Array.isArray(response.voices)) &&
    (response.has_more === undefined || typeof response.has_more === "boolean") &&
    (response.next_page_token === undefined ||
      response.next_page_token === null ||
      typeof response.next_page_token === "string")
  );
}
