import "server-only";

import { decrypt } from "@/lib/hyperlocal/encryption";
import type {
  HlEmailAppMetadata,
  PlatformEmailConnection,
} from "@/types/platform-connections";

// ============================================================
// Server-side Mailchimp REST helper. Picks OAuth token (Bearer-ish "OAuth"
// scheme) when the connection was added via /oauth/callback, otherwise
// falls back to the API-key Basic auth used by the /connect path.
//
// Wave 9: auth blobs live on PlatformEmailConnection (shared); the
// per-app metadata (dc, audience_id) lives on
// AppEmailConnectionState.provider_metadata. Callers resolve both and
// pass them in explicitly.
// ============================================================

export interface McAuth {
  authHeader: string;
  dc: string;
  audienceId: string | null;
}

export function mcAuthFromConnection(
  conn: PlatformEmailConnection,
  metadata: HlEmailAppMetadata,
): McAuth {
  const dc = metadata.mailchimp?.dc;
  if (!dc) {
    throw new Error("Mailchimp connection missing datacenter — reconnect under Settings → Email.");
  }

  if (conn.provider_oauth_access_token_encrypted) {
    const token = decrypt(conn.provider_oauth_access_token_encrypted);
    return {
      authHeader: `OAuth ${token}`,
      dc,
      audienceId: metadata.mailchimp?.audience_id ?? null,
    };
  }
  if (conn.provider_api_key_encrypted) {
    const key = decrypt(conn.provider_api_key_encrypted);
    return {
      authHeader: "Basic " + Buffer.from(`hl:${key}`).toString("base64"),
      dc,
      audienceId: metadata.mailchimp?.audience_id ?? null,
    };
  }
  throw new Error("Mailchimp connection has no credential stored.");
}

export async function mcRequest<T>(
  auth: McAuth,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`https://${auth.dc}.api.mailchimp.com/3.0${path}`, {
    method,
    headers: {
      Authorization: auth.authHeader,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Surface the full Mailchimp response — their 400s carry an `errors`
    // array that's invaluable for debugging and was previously truncated.
    console.error(
      `[mailchimp] ${method} ${path} → ${res.status}`,
      text,
    );
    throw new Error(
      `Mailchimp ${method} ${path} → ${res.status}: ${text.slice(0, 1500)}`,
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
