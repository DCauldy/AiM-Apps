export type OpenRouterErrorCode =
  | "OPENROUTER_CONFIGURATION_ERROR"
  | "OPENROUTER_AUTH_ERROR"
  | "OPENROUTER_CREDITS_ERROR"
  | "OPENROUTER_RATE_LIMIT"
  | "OPENROUTER_BAD_REQUEST"
  | "OPENROUTER_FORBIDDEN"
  | "OPENROUTER_TIMEOUT"
  | "OPENROUTER_PROVIDER_ERROR"
  | "OPENROUTER_NETWORK_ERROR"
  | "OPENROUTER_MALFORMED_RESPONSE"
  | "OPENROUTER_MISSING_CONTENT"
  | "OPENROUTER_VIDEO_JOB_FAILED"
  | "OPENROUTER_VIDEO_JOB_TIMEOUT";

export type OpenRouterErrorContext = {
  code: OpenRouterErrorCode;
  operation?: string;
  endpoint?: string;
  model?: string;
  status?: number;
  responseBody?: unknown;
  requestId?: string | null;
  retryable?: boolean;
  cause?: unknown;
};

export class OpenRouterError extends Error {
  readonly code: OpenRouterErrorCode;
  readonly operation?: string;
  readonly endpoint?: string;
  readonly model?: string;
  readonly status?: number;
  readonly responseBody?: unknown;
  readonly requestId?: string | null;
  readonly retryable: boolean;

  constructor(message: string, context: OpenRouterErrorContext) {
    super(message);
    this.name = "OpenRouterError";
    this.code = context.code;
    this.operation = context.operation;
    this.endpoint = context.endpoint;
    this.model = context.model;
    this.status = context.status;
    this.responseBody = context.responseBody;
    this.requestId = context.requestId;
    this.retryable = context.retryable ?? false;
    if (context.cause) {
      this.cause = context.cause;
    }
  }
}

export class OpenRouterConfigurationError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_CONFIGURATION_ERROR" });
    this.name = "OpenRouterConfigurationError";
  }
}

export class OpenRouterAuthenticationError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_AUTH_ERROR" });
    this.name = "OpenRouterAuthenticationError";
  }
}

export class OpenRouterInsufficientCreditsError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_CREDITS_ERROR" });
    this.name = "OpenRouterInsufficientCreditsError";
  }
}

export class OpenRouterRateLimitError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_RATE_LIMIT", retryable: true });
    this.name = "OpenRouterRateLimitError";
  }
}

export class OpenRouterBadRequestError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_BAD_REQUEST" });
    this.name = "OpenRouterBadRequestError";
  }
}

export class OpenRouterForbiddenError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_FORBIDDEN" });
    this.name = "OpenRouterForbiddenError";
  }
}

export class OpenRouterTimeoutError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_TIMEOUT", retryable: true });
    this.name = "OpenRouterTimeoutError";
  }
}

export class OpenRouterProviderError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_PROVIDER_ERROR", retryable: true });
    this.name = "OpenRouterProviderError";
  }
}

export class OpenRouterNetworkError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_NETWORK_ERROR", retryable: true });
    this.name = "OpenRouterNetworkError";
  }
}

export class OpenRouterMalformedResponseError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_MALFORMED_RESPONSE" });
    this.name = "OpenRouterMalformedResponseError";
  }
}

export class OpenRouterMissingContentError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_MISSING_CONTENT" });
    this.name = "OpenRouterMissingContentError";
  }
}

export class OpenRouterVideoJobFailedError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_VIDEO_JOB_FAILED" });
    this.name = "OpenRouterVideoJobFailedError";
  }
}

export class OpenRouterVideoJobTimeoutError extends OpenRouterError {
  constructor(message: string, context: Omit<OpenRouterErrorContext, "code"> = {}) {
    super(message, { ...context, code: "OPENROUTER_VIDEO_JOB_TIMEOUT", retryable: true });
    this.name = "OpenRouterVideoJobTimeoutError";
  }
}

export function isOpenRouterError(error: unknown): error is OpenRouterError {
  return error instanceof OpenRouterError;
}

export function createOpenRouterHttpError(input: {
  operation: string;
  endpoint: string;
  model?: string;
  status: number;
  responseBody: unknown;
  requestId?: string | null;
}): OpenRouterError {
  const message = openRouterErrorMessage(input.responseBody)
    ?? `OpenRouter request failed with status ${input.status}.`;
  const context = {
    operation: input.operation,
    endpoint: input.endpoint,
    model: input.model,
    status: input.status,
    responseBody: input.responseBody,
    requestId: input.requestId,
  };

  switch (input.status) {
    case 400:
      return new OpenRouterBadRequestError(message, context);
    case 401:
      return new OpenRouterAuthenticationError(message, context);
    case 402:
      return new OpenRouterInsufficientCreditsError(message, context);
    case 403:
      return new OpenRouterForbiddenError(message, context);
    case 408:
      return new OpenRouterTimeoutError(message, context);
    case 429:
      return new OpenRouterRateLimitError(message, context);
    case 502:
      return new OpenRouterProviderError(message, context);
    default:
      if (input.status >= 500) {
        return new OpenRouterProviderError(message, context);
      }
      return new OpenRouterBadRequestError(message, context);
  }
}

function openRouterErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  const message = record.message;
  return typeof message === "string" && message.trim() ? message : null;
}
