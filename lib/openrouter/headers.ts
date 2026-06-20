import type { OpenRouterAppInfo } from "./types";
import { OpenRouterConfigurationError } from "./errors";

export function buildOpenRouterHeaders(input: {
  apiKey: string;
  app: OpenRouterAppInfo;
  headers?: HeadersInit;
  includeJsonContentType?: boolean;
}): Headers {
  const headers = new Headers(input.headers);
  headers.set("Authorization", `Bearer ${input.apiKey}`);

  if (input.includeJsonContentType !== false && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  setIfAbsent(headers, "HTTP-Referer", input.app.referer);
  setIfAbsent(headers, "X-OpenRouter-Title", input.app.title);
  setIfAbsent(headers, "X-Title", input.app.title);

  if (input.app.categories?.length && !headers.has("X-OpenRouter-Categories")) {
    headers.set("X-OpenRouter-Categories", input.app.categories.join(","));
  }

  return headers;
}

export function createOpenRouterFetch(input: {
  apiKey?: string;
  app: OpenRouterAppInfo;
  fetcher?: typeof fetch;
}): typeof fetch {
  return (resource, init) => {
    if (!input.apiKey) {
      throw new OpenRouterConfigurationError("OpenRouter API key is required.");
    }

    return (input.fetcher ?? fetch)(resource, {
      ...init,
      headers: buildOpenRouterHeaders({
        apiKey: input.apiKey,
        app: input.app,
        headers: init?.headers,
      }),
    });
  };
}

function setIfAbsent(headers: Headers, key: string, value: string) {
  if (!headers.has(key)) {
    headers.set(key, value);
  }
}
