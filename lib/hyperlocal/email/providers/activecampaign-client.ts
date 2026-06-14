import "server-only";

import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlEmailConnection } from "@/types/hyperlocal";

// ============================================================
// ActiveCampaign REST helper.
//
// AC has two coexisting APIs:
//   - v3 (modern, JSON) at  https://<account>.api-us1.com/api/3/<resource>
//   - v1 (legacy, query-string) at  https://<account>.api-us1.com/admin/api.php
//
// We use v3 for everything except test-send (v3 has no dedicated test
// endpoint — the v1 campaign_send with action=test is the canonical way
// to deliver a single preview without polluting the audience's recipient
// stream).
//
// Both APIs accept the same Api-Token header. The API URL is stored
// per-connection because some accounts use regional endpoints (e.g.
// .api-us2.com) — we never hard-code .api-us1.com.
// ============================================================

export interface AcAuth {
  /** Base URL ending right before /api/3 — e.g. "https://your-account.api-us1.com" */
  baseUrl: string;
  apiKey: string;
  listId: string | null;
}

export function acAuthFromConnection(conn: HlEmailConnection): AcAuth {
  const meta = (conn.provider_metadata ?? {}) as {
    activecampaign?: { base_url?: string; list_id?: string };
  };
  const baseUrl = meta.activecampaign?.base_url;
  if (!baseUrl) {
    throw new Error(
      "ActiveCampaign connection missing API URL — reconnect under Settings → Email.",
    );
  }
  const encryptedKey = conn.provider_api_key_encrypted;
  if (!encryptedKey) {
    throw new Error("ActiveCampaign connection has no API key stored.");
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey: decrypt(encryptedKey),
    listId: meta.activecampaign?.list_id ?? null,
  };
}

/** Normalize whatever the user pasted into a clean origin like
 *  "https://acctname.api-us1.com" — accepts full /api/3 paths, trailing
 *  slashes, etc. Throws if the result isn't a valid https URL. */
export function normalizeAcBaseUrl(input: string): string {
  let s = input.trim();
  if (!s) throw new Error("API URL is required.");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error("API URL isn't a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("API URL must use https://");
  }
  // Strip any path the user pasted (their Developer tab shows the URL
  // with or without /api/3) — we'll build paths ourselves.
  return `${url.protocol}//${url.host}`;
}

export async function acV3<T>(
  auth: AcAuth,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${auth.baseUrl}/api/3${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Api-Token": auth.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[activecampaign] ${method} ${path} → ${res.status}`,
      text,
    );
    throw new Error(
      `ActiveCampaign ${method} ${path} → ${res.status}: ${text.slice(0, 1500)}`,
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

/** Count active subscribers on an AC list. The /lists endpoint doesn't
 *  return subscriber counts by default — we query /contactLists with
 *  filters and read meta.total. status=1 is "active subscriber". */
export async function acListSubscriberCount(
  auth: AcAuth,
  listId: string,
): Promise<number> {
  try {
    const data = await acV3<{
      meta?: { total?: string | number };
    }>(
      auth,
      "GET",
      `/contactLists?filters[list]=${encodeURIComponent(listId)}&filters[status]=1&limit=1`,
    );
    return Number(data.meta?.total ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Legacy v1 helper — used for the endpoints AC never ported to v3
 *  (campaign_create, campaign_send action=test, campaign_delete).
 *
 *  v1 supports bracketed param keys like `m[123]=100` for message-weight
 *  maps and `p[5]=5` for list ids — pass these as the keys directly,
 *  URLSearchParams encodes them correctly.
 *
 *  Returns parsed JSON body when AC sent one (api_output=json), plus
 *  the raw text for error surfacing. `ok` reflects AC's result_code
 *  (1 = success) when present, otherwise falls back to HTTP 2xx. */
export async function acV1<T = Record<string, unknown>>(
  auth: AcAuth,
  apiAction: string,
  params: Record<string, string | number>,
): Promise<{ ok: boolean; raw: string; json: T | null }> {
  // POST with form-encoded body — GET with everything in the query
  // string trips Tomcat's URL-length limit (~8KB) the moment we ship a
  // rendered email body to message_add. api_action + api_output stay in
  // the URL since they're the request router.
  const urlSearch = new URLSearchParams();
  urlSearch.set("api_action", apiAction);
  urlSearch.set("api_output", "json");
  const url = `${auth.baseUrl}/admin/api.php?${urlSearch.toString()}`;

  const bodySearch = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    bodySearch.set(k, String(v));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Api-Token": auth.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodySearch.toString(),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(
      `[activecampaign-v1] ${apiAction} → ${res.status}`,
      raw,
    );
    throw new Error(
      `ActiveCampaign v1 ${apiAction} → ${res.status}: ${raw.slice(0, 800)}`,
    );
  }
  let json: T | null = null;
  let ok = true;
  try {
    json = JSON.parse(raw) as T;
    const resultCode = (json as { result_code?: number }).result_code;
    if (resultCode !== undefined) ok = resultCode === 1;
  } catch {
    // Bare-text response — treat 2xx HTTP as success.
  }
  if (!ok) {
    console.error(
      `[activecampaign-v1] ${apiAction} returned result_code != 1`,
      raw,
    );
  }
  return { ok, raw, json };
}
