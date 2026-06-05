import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://public.cincapi.com/v2";

interface CincLead {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  labels?: string[] | null;       // CINC uses "labels" rather than tags
  source?: string | null;
  custom_fields?: Record<string, string | number | null>;
}

interface CincLeadsResponse {
  leads?: CincLead[];
  data?: CincLead[];
  total?: number;
  has_more?: boolean;
}

function authHeader(conn: HlCrmConnection): string {
  if (!conn.api_key_encrypted) {
    throw new Error("CINC API key not configured");
  }
  return `Bearer ${decrypt(conn.api_key_encrypted)}`;
}

async function cincGet(
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
    throw new Error(`CINC ${res.status}: ${err.message ?? res.statusText}`);
  }
  return data;
}

function extractLeads(data: unknown): CincLead[] {
  const r = data as CincLeadsResponse;
  return r.leads ?? r.data ?? [];
}

function normalize(
  conn: HlCrmConnection,
  l: CincLead
): NormalizedContact | null {
  if (!l.email || !isValidEmail(l.email)) return null;
  const tags = l.labels ?? [];
  const customFieldValue =
    conn.search_area_column && l.custom_fields
      ? (l.custom_fields[conn.search_area_column] as string | undefined)
      : undefined;

  return {
    external_id: String(l.id),
    first_name: l.first_name ?? "",
    last_name: l.last_name ?? "",
    email: l.email.toLowerCase(),
    phone: l.phone ?? undefined,
    home_address: {
      street: l.address ?? undefined,
      city: l.city ?? undefined,
      state: l.state ?? undefined,
      zip: l.zip ?? undefined,
    },
    search_areas: extractSearchAreas(conn, customFieldValue, tags),
    tags,
    source: l.source ?? undefined,
  };
}

export const cincConnector: CrmConnector = {
  async testConnection(conn): Promise<TestConnectionResult> {
    try {
      const data = await cincGet(conn, "/site/leads", { limit: 1 });
      const leads = extractLeads(data);
      return {
        ok: true,
        sample: leads[0] ? normalize(conn, leads[0]) ?? undefined : undefined,
        contact_count_estimate: (data as CincLeadsResponse).total,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchContacts(conn, opts: FetchContactsOptions = {}) {
    const pageSize = Math.min(opts.pageSize ?? 100, 100);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let offset = 0;

    while (all.length < totalCap) {
      const data = await cincGet(conn, "/site/leads", {
        limit: pageSize,
        offset,
      });
      const batch = extractLeads(data);
      if (batch.length === 0) break;
      for (const l of batch) {
        const n = normalize(conn, l);
        if (n) all.push(n);
        if (all.length >= totalCap) break;
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return dedupeByEmail(all);
  },
};
