import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

interface GhlContact {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  tags?: string[] | null;
  source?: string | null;
  customFields?:
    | Record<string, string | number | null>
    | Array<{ id: string; value: string | number | null }>;
  locationId?: string;
}

interface GhlContactsResponse {
  contacts?: GhlContact[];
  meta?: { total?: number; nextPageUrl?: string; currentPage?: number };
}

function authHeader(conn: HlCrmConnection): string {
  // GHL supports either a private integration token (stored as api_key) or
  // OAuth access tokens — both are sent as Bearer.
  const token = conn.oauth_access_token_encrypted
    ? decrypt(conn.oauth_access_token_encrypted)
    : conn.api_key_encrypted
      ? decrypt(conn.api_key_encrypted)
      : null;
  if (!token) {
    throw new Error(
      "GoHighLevel access token or private integration token not configured"
    );
  }
  return `Bearer ${token}`;
}

async function ghlGet(
  conn: HlCrmConnection,
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<unknown> {
  const base = conn.base_url ?? DEFAULT_BASE;
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authHeader(conn),
        Version: API_VERSION,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data as { message?: string };
    throw new Error(
      `GoHighLevel ${res.status}: ${err.message ?? res.statusText}`
    );
  }
  return data;
}

function pickCustomField(
  raw: GhlContact["customFields"] | undefined,
  fieldName: string | undefined
): string | undefined {
  if (!raw || !fieldName) return undefined;
  if (Array.isArray(raw)) {
    const match = raw.find((f) => f.id === fieldName);
    return match?.value != null ? String(match.value) : undefined;
  }
  const v = raw[fieldName];
  return v != null ? String(v) : undefined;
}

function normalize(
  conn: HlCrmConnection,
  c: GhlContact
): NormalizedContact | null {
  if (!c.email || !isValidEmail(c.email)) return null;
  const tags = c.tags ?? [];
  const customFieldValue = pickCustomField(
    c.customFields,
    conn.search_area_column ?? undefined
  );

  return {
    external_id: c.id,
    first_name: c.firstName ?? "",
    last_name: c.lastName ?? "",
    email: c.email.toLowerCase(),
    phone: c.phone ?? undefined,
    home_address: {
      street: c.address1 ?? undefined,
      city: c.city ?? undefined,
      state: c.state ?? undefined,
      zip: c.postalCode ?? undefined,
    },
    search_areas: extractSearchAreas(conn, customFieldValue, tags),
    tags,
    source: c.source ?? undefined,
  };
}

function getLocationId(conn: HlCrmConnection): string | undefined {
  // GHL contacts/ requires a locationId. Stored either in base_url field
  // (legacy) or — preferred — via column_mapping.location_id.
  const fromMapping = (conn.column_mapping as { location_id?: string } | null)
    ?.location_id;
  return fromMapping;
}

export const gohighlevelConnector: CrmConnector = {
  async testConnection(conn): Promise<TestConnectionResult> {
    try {
      const locationId = getLocationId(conn);
      if (!locationId) {
        return {
          ok: false,
          error:
            "GoHighLevel requires a Location ID. Add it under Advanced settings.",
        };
      }
      const data = await ghlGet(conn, "/contacts/", {
        locationId,
        limit: 1,
      });
      const contacts = (data as GhlContactsResponse).contacts ?? [];
      return {
        ok: true,
        sample: contacts[0]
          ? normalize(conn, contacts[0]) ?? undefined
          : undefined,
        contact_count_estimate: (data as GhlContactsResponse).meta?.total,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchContacts(conn, opts: FetchContactsOptions = {}) {
    const locationId = getLocationId(conn);
    if (!locationId) {
      throw new Error(
        "GoHighLevel requires a Location ID under Advanced settings"
      );
    }
    const pageSize = Math.min(opts.pageSize ?? 100, 100);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let page = 1;

    while (all.length < totalCap) {
      const data = await ghlGet(conn, "/contacts/", {
        locationId,
        limit: pageSize,
        page,
      });
      const batch = (data as GhlContactsResponse).contacts ?? [];
      if (batch.length === 0) break;
      for (const c of batch) {
        const n = normalize(conn, c);
        if (n) all.push(n);
        if (all.length >= totalCap) break;
      }
      if (batch.length < pageSize) break;
      page += 1;
    }
    return dedupeByEmail(all);
  },
};
