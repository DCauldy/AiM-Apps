import "server-only";

// ============================================================
// Otterly.ai API client — minimal wrapper over their REST API.
//
// Docs: https://docs.otterly.ai/api-reference
// Auth: Bearer token (Standard / Premium plans only).
//
// This is the probe surface for Radar v2. Once we know the data
// shape we want to surface, the rebuild plan writes itself and we
// can expand the client into typed accessors per endpoint.
// ============================================================

const BASE_URL = "https://api.otterly.ai";

export class OtterlyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "OtterlyApiError";
  }
}

export interface OtterlyClientOptions {
  /** Bearer token. Defaults to process.env.OTTERLY_API_KEY. */
  apiKey?: string;
  /** Override base URL — useful for testing against a staging instance
   *  or recording. Defaults to https://api.otterly.ai. */
  baseUrl?: string;
}

export function createOtterlyClient(opts: OtterlyClientOptions = {}) {
  const apiKey = opts.apiKey ?? process.env.OTTERLY_API_KEY;
  const baseUrl = (opts.baseUrl ?? BASE_URL).replace(/\/+$/, "");
  if (!apiKey) {
    throw new OtterlyApiError(
      "OTTERLY_API_KEY not configured. Set it in .env.local (Standard or Premium Otterly plan required).",
      500,
      null,
    );
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      // Otterly's rate limit is 2k req / 5min — generous enough that
      // we don't need client-side throttling for the probe. Default
      // fetch is fine.
    });

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const message =
        (body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : null) ?? `Otterly ${res.status} on ${path}`;
      throw new OtterlyApiError(message, res.status, body);
    }

    return body as T;
  }

  return {
    /** Raw passthrough — useful for the probe sandbox where we don't
     *  yet know which endpoints we care about. Returns whatever
     *  Otterly returns. */
    raw: <T = unknown>(path: string, init?: RequestInit) =>
      request<T>(path, init),
    // Typed accessors will land here once we map their endpoints to
    // the bits we surface in the rebuilt Radar dashboard.
  };
}

export type OtterlyClient = ReturnType<typeof createOtterlyClient>;
