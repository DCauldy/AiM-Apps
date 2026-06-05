import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://api.cloze.com";

interface ClozePerson {
  uniqueid?: string;
  id?: string | number;
  name?: { first?: string; last?: string };
  first_name?: string;
  last_name?: string;
  emails?: Array<{ email?: string; address?: string; value?: string }>;
  phones?: Array<{ phone?: string; value?: string }>;
  addresses?: Array<{
    address?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    postal_code?: string;
  }>;
  labels?: string[];
  tags?: string[];
  source?: string;
  customFields?: Record<string, string | number | null>;
}

interface ClozePeopleResponse {
  people?: ClozePerson[];
  data?: ClozePerson[];
  results?: ClozePerson[];
  has_more?: boolean;
  next_cursor?: string;
}

function getKey(conn: HlCrmConnection): string {
  if (!conn.api_key_encrypted) {
    throw new Error("Cloze API key not configured");
  }
  return decrypt(conn.api_key_encrypted);
}

async function clozeGet(
  conn: HlCrmConnection,
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<unknown> {
  const base = conn.base_url ?? DEFAULT_BASE;
  const url = new URL(base + path);
  url.searchParams.set("api_key", getKey(conn));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
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
    throw new Error(`Cloze ${res.status}: ${err.message ?? res.statusText}`);
  }
  return data;
}

function extractPeople(data: unknown): ClozePerson[] {
  const r = data as ClozePeopleResponse;
  return r.people ?? r.data ?? r.results ?? [];
}

function getEmail(p: ClozePerson): string | undefined {
  for (const e of p.emails ?? []) {
    const candidate = e.email ?? e.address ?? e.value;
    if (candidate && isValidEmail(candidate)) return candidate;
  }
  return undefined;
}

function getPhone(p: ClozePerson): string | undefined {
  for (const ph of p.phones ?? []) {
    if (ph.phone) return ph.phone;
    if (ph.value) return ph.value;
  }
  return undefined;
}

function normalize(
  conn: HlCrmConnection,
  p: ClozePerson
): NormalizedContact | null {
  const email = getEmail(p);
  if (!email) return null;

  const first = p.first_name ?? p.name?.first ?? "";
  const last = p.last_name ?? p.name?.last ?? "";
  const addr = p.addresses?.[0];
  const tags = p.labels ?? p.tags ?? [];
  const customFieldValue =
    conn.search_area_column && p.customFields
      ? (p.customFields[conn.search_area_column] as string | undefined)
      : undefined;

  return {
    external_id: String(p.uniqueid ?? p.id ?? email),
    first_name: first,
    last_name: last,
    email: email.toLowerCase(),
    phone: getPhone(p),
    home_address: addr
      ? {
          street: addr.street ?? addr.address ?? undefined,
          city: addr.city ?? undefined,
          state: addr.state ?? undefined,
          zip: addr.zip ?? addr.postal_code ?? undefined,
        }
      : undefined,
    search_areas: extractSearchAreas(conn, customFieldValue, tags),
    tags,
    source: p.source ?? undefined,
  };
}

export const clozeConnector: CrmConnector = {
  async testConnection(conn): Promise<TestConnectionResult> {
    try {
      const data = await clozeGet(conn, "/v1/people/feed", { count: 1 });
      const people = extractPeople(data);
      return {
        ok: true,
        sample: people[0] ? normalize(conn, people[0]) ?? undefined : undefined,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchContacts(conn, opts: FetchContactsOptions = {}) {
    const pageSize = Math.min(opts.pageSize ?? 100, 100);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let cursor: string | undefined;
    let safetyHops = 0;

    while (all.length < totalCap && safetyHops < 500) {
      const params: Record<string, string | number> = { count: pageSize };
      if (cursor) params.cursor = cursor;
      const data = await clozeGet(conn, "/v1/people/feed", params);
      const batch = extractPeople(data);
      if (batch.length === 0) break;
      for (const p of batch) {
        const n = normalize(conn, p);
        if (n) all.push(n);
        if (all.length >= totalCap) break;
      }
      const next = (data as ClozePeopleResponse).next_cursor;
      if (!next || next === cursor) break;
      cursor = next;
      safetyHops += 1;
    }
    return dedupeByEmail(all);
  },
};
