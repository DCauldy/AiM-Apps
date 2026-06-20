export type OpenRouterAppInfo = {
  title: string;
  referer: string;
  categories?: string[];
};

export type OpenRouterClientOptions = {
  apiKey?: string;
  app: OpenRouterAppInfo;
  fetcher?: typeof fetch;
  baseUrl?: string;
};

export type OpenRouterRequestInput = {
  operation: string;
  path: string;
  method?: "GET" | "POST";
  model?: string;
  body?: unknown;
  headers?: HeadersInit;
};

export type OpenRouterTextContentPart = {
  type: "text";
  text: string;
};

export type OpenRouterImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type OpenRouterContentPart = OpenRouterTextContentPart | OpenRouterImageContentPart;

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenRouterContentPart[];
};

export type OpenRouterChatCompletionResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
    native_finish_reason?: string;
  }>;
  usage?: unknown;
  error?: unknown;
};

export type OpenRouterChatCompletionInput = {
  operation: string;
  model: string;
  messages: OpenRouterChatMessage[];
  responseFormat?: { type: "json_object" };
  extraBody?: Record<string, unknown>;
};

export type OpenRouterChatTextResult = {
  content: string;
  usage?: unknown;
  raw: OpenRouterChatCompletionResponse;
};

export type OpenRouterChatJsonResult<T> = OpenRouterChatTextResult & {
  value: T;
};

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

export type OpenRouterVideoJob = {
  id?: string;
  status?: string;
  polling_url?: string;
  error?: string;
  unsigned_urls?: string[];
};

export type OpenRouterCreateVideoInput = {
  operation: string;
  body: OpenRouterVideoRequestBody;
};

export type OpenRouterPollVideoJobInput = {
  operation: string;
  model?: string;
  job: OpenRouterVideoJob | null;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export type OpenRouterRenderVideoInput = OpenRouterCreateVideoInput & {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export type OpenRouterVideoRenderResult = {
  id: string | null;
  status: "completed";
  outputUrls: string[];
  raw: OpenRouterVideoJob;
};
