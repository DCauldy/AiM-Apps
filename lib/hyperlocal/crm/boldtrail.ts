import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://api.kvcore.com";

interface KvAddress {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

interface BoldTrailContact {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: KvAddress | null;
  tags?: string[] | null;
  source?: string | null;
  custom_fields?: Record<string, string | number | null>;
}

interface BoldTrailContactsResponse {
  data?: BoldTrailContact[];
  contacts?: BoldTrailContact[];
  meta?: { total?: number; page?: number; per_page?: number };
}

function authHeader(conn: HlCrmConnection): string {
  if (!conn.api_key_encrypted) {
    throw new Error("BoldTrail API token not configured");
  }
  return `Bearer ${decrypt(conn.api_key_encrypted)}`;
}

async function btGet(
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
    throw new Error(`BoldTrail ${res.status}: ${err.message ?? res.statusText}`);
  }
  return data;
}

function extractContacts(data: unknown): BoldTrailContact[] {
  const r = data as BoldTrailContactsResponse;
  return r.data ?? r.contacts ?? [];
}

function normalize(
  conn: HlCrmConnection,
  c: BoldTrailContact
): NormalizedContact | null {
  if (!c.email || !isValidEmail(c.email)) return null;
  const tags = c.tags ?? [];
  const customFieldValue =
    conn.search_area_column && c.custom_fields
      ? (c.custom_fields[conn.search_area_column] as string | undefined)
      : undefined;

  return {
    external_id: String(c.id),
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    email: c.email.toLowerCase(),
    phone: c.phone ?? undefined,
    home_address: c.address
      ? {
          street: c.address.street ?? undefined,
          city: c.address.city ?? undefined,
          state: c.address.state ?? undefined,
          zip: c.address.zip ?? undefined,
        }
      : undefined,
    search_areas: extractSearchAreas(conn, customFieldValue, tags),
    tags,
    source: c.source ?? undefined,
  };
}

export const boldtrailConnector: CrmConnector = {
  async testConnection(conn): Promise<TestConnectionResult> {
    try {
      const data = await btGet(conn, "/v2/public/contacts", { per_page: 1 });
      const contacts = extractContacts(data);
      return {
        ok: true,
        sample: contacts[0]
          ? normalize(conn, contacts[0]) ?? undefined
          : undefined,
        contact_count_estimate: (data as BoldTrailContactsResponse).meta?.total,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchContacts(conn, opts: FetchContactsOptions = {}) {
    const pageSize = Math.min(opts.pageSize ?? 100, 100);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let page = 1;

    while (all.length < totalCap) {
      const data = await btGet(conn, "/v2/public/contacts", {
        page,
        per_page: pageSize,
      });
      const batch = extractContacts(data);
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
