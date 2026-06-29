import { OPENROUTER_BASE_URL } from "./apps";
import { buildOpenRouterHeaders } from "./headers";
import {
  createOpenRouterHttpError,
  OpenRouterConfigurationError,
  OpenRouterMalformedResponseError,
  OpenRouterMissingContentError,
  OpenRouterNetworkError,
  OpenRouterVideoJobFailedError,
  OpenRouterVideoJobTimeoutError,
} from "./errors";
import type {
  OpenRouterChatCompletionInput,
  OpenRouterChatCompletionResponse,
  OpenRouterChatJsonResult,
  OpenRouterChatTextResult,
  OpenRouterClientOptions,
  OpenRouterCreateVideoInput,
  OpenRouterPollVideoJobInput,
  OpenRouterRenderVideoInput,
  OpenRouterRequestInput,
  OpenRouterVideoJob,
  OpenRouterVideoRenderResult,
} from "./types";

export type OpenRouterClient = ReturnType<typeof createOpenRouterClient>;

export function createOpenRouterClient(options: OpenRouterClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL;

  async function request<T>(input: OpenRouterRequestInput): Promise<T> {
    if (!options.apiKey) {
      throw new OpenRouterConfigurationError("OpenRouter API key is required.", {
        operation: input.operation,
        endpoint: input.path,
        model: input.model,
      });
    }

    const url = buildOpenRouterUrl(input.path, baseUrl);
    const endpoint = endpointLabel(url, baseUrl);
    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        method: input.method ?? (input.body === undefined ? "GET" : "POST"),
        headers: buildOpenRouterHeaders({
          apiKey: options.apiKey,
          app: options.app,
          headers: input.headers,
          includeJsonContentType: input.body !== undefined,
        }),
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
    } catch (error) {
      throw new OpenRouterNetworkError("OpenRouter request failed before receiving a response.", {
        operation: input.operation,
        endpoint,
        model: input.model,
        cause: error,
      });
    }

    const responseText = await response.text().catch(() => "");
    const responseBody = parseJsonResponseBody(responseText);
    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("x-openrouter-request-id") ??
      null;

    if (!response.ok) {
      throw createOpenRouterHttpError({
        operation: input.operation,
        endpoint,
        model: input.model,
        status: response.status,
        responseBody,
        requestId,
      });
    }

    if (responseText.trim() === "") {
      return null as T;
    }

    if (responseBody === null) {
      throw new OpenRouterMalformedResponseError("OpenRouter response was not valid JSON.", {
        operation: input.operation,
        endpoint,
        model: input.model,
        status: response.status,
        responseBody: responseText,
        requestId,
      });
    }

    return responseBody as T;
  }

  async function chatCompletion(
    input: OpenRouterChatCompletionInput
  ): Promise<OpenRouterChatCompletionResponse> {
    return request<OpenRouterChatCompletionResponse>({
      operation: input.operation,
      path: "/chat/completions",
      method: "POST",
      model: input.model,
      body: {
        model: input.model,
        response_format: input.responseFormat,
        messages: input.messages,
        ...input.extraBody,
      },
    });
  }

  async function chatText(input: OpenRouterChatCompletionInput): Promise<OpenRouterChatTextResult> {
    const raw = await chatCompletion(input);
    const content = raw.choices?.[0]?.message?.content;
    if (!content) {
      throw new OpenRouterMissingContentError("OpenRouter chat response missing message content.", {
        operation: input.operation,
        endpoint: "/chat/completions",
        model: input.model,
        responseBody: raw,
      });
    }

    return { content, usage: raw.usage, raw };
  }

  async function chatJson<T>(
    input: OpenRouterChatCompletionInput
  ): Promise<OpenRouterChatJsonResult<T>> {
    const result = await chatText({
      ...input,
      responseFormat: input.responseFormat ?? { type: "json_object" },
    });
    const value = parseJsonObjectContent(result.content);
    if (!value) {
      throw new OpenRouterMalformedResponseError("OpenRouter chat content was not valid JSON.", {
        operation: input.operation,
        endpoint: "/chat/completions",
        model: input.model,
        responseBody: result.content,
      });
    }

    return { ...result, value: value as T };
  }

  async function createVideo(input: OpenRouterCreateVideoInput): Promise<OpenRouterVideoJob> {
    return request<OpenRouterVideoJob>({
      operation: input.operation,
      path: "/videos",
      method: "POST",
      model: input.body.model,
      body: input.body,
    });
  }

  async function pollVideoJob(input: OpenRouterPollVideoJobInput): Promise<OpenRouterVideoJob> {
    const pollIntervalMs = input.pollIntervalMs ?? 20_000;
    const maxPollAttempts = input.maxPollAttempts ?? 90;
    let current = input.job;

    for (let attempt = 0; attempt <= maxPollAttempts; attempt += 1) {
      if (current?.status === "completed") {
        return current;
      }
      if (current?.status && ["failed", "cancelled", "expired"].includes(current.status)) {
        throw new OpenRouterVideoJobFailedError("OpenRouter video generation failed.", {
          operation: input.operation,
          endpoint: "/videos",
          model: input.model,
          responseBody: current,
        });
      }
      if (!current?.id && !current?.polling_url) {
        throw new OpenRouterMalformedResponseError(
          "OpenRouter video response did not include a job id.",
          {
            operation: input.operation,
            endpoint: "/videos",
            model: input.model,
            responseBody: current,
          }
        );
      }
      if (attempt === maxPollAttempts) {
        break;
      }

      await sleep(pollIntervalMs);
      current = await request<OpenRouterVideoJob>({
        operation: input.operation,
        path: current.polling_url ?? `/videos/${encodeURIComponent(current.id ?? "")}`,
        method: "GET",
        model: input.model,
      });
    }

    throw new OpenRouterVideoJobTimeoutError("OpenRouter video generation timed out.", {
      operation: input.operation,
      endpoint: "/videos",
      model: input.model,
      responseBody: current,
    });
  }

  async function renderVideo(
    input: OpenRouterRenderVideoInput
  ): Promise<OpenRouterVideoRenderResult> {
    const submitted = await createVideo(input);
    const completed = await pollVideoJob({
      operation: input.operation,
      model: input.body.model,
      job: submitted,
      pollIntervalMs: input.pollIntervalMs,
      maxPollAttempts: input.maxPollAttempts,
    });
    const outputUrls = completed.unsigned_urls ?? [];
    if (outputUrls.length === 0) {
      throw new OpenRouterMissingContentError(
        "OpenRouter video response did not include an unsigned output URL.",
        {
          operation: input.operation,
          endpoint: "/videos",
          model: input.body.model,
          responseBody: completed,
        }
      );
    }

    return {
      id: completed.id ?? null,
      status: "completed",
      outputUrls,
      raw: completed,
    };
  }

  return {
    request,
    chat: {
      completion: chatCompletion,
      text: chatText,
      json: chatJson,
    },
    video: {
      create: createVideo,
      poll: pollVideoJob,
      render: renderVideo,
    },
  };
}

function parseJsonResponseBody(value: string): unknown {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonObjectContent(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const direct = parseJsonObject(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    const parsed = parseJsonObject(fenced.trim());
    if (parsed) return parsed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return parseJsonObject(trimmed.slice(start, end + 1));
}

function parseJsonObject(value: string): unknown | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildOpenRouterUrl(path: string, baseUrl: string): URL {
  if (/^https?:\/\//i.test(path)) {
    return new URL(path);
  }

  const base = new URL(ensureTrailingSlash(baseUrl));
  if (path.startsWith("/api/")) {
    return new URL(path, base.origin);
  }

  return new URL(path.startsWith("/") ? path.slice(1) : path, base);
}

function endpointLabel(url: URL, baseUrl: string): string {
  const base = new URL(ensureTrailingSlash(baseUrl));
  if (url.origin === base.origin) {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
