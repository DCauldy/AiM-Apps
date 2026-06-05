import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://api.sierrainteractivedev.com";

interface SierraLead {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tags?: string[] | null;
  source?: string | null;
  customFields?: Record<string, string | number | null>;
}

interface SierraFindResponse {
  data?: { leads?: SierraLead[]; totalCount?: number };
  leads?: SierraLead[];
  totalCount?: number;
}

function buildHeaders(conn: HlCrmConnection): Record<string, string> {
  if (!conn.api_key_encrypted) {
    throw new Error("Sierra API key not configured");
  }
  return {
    "Sierra-ApiKey": decrypt(conn.api_key_encrypted),
    "Sierra-OriginatingSystemName": "AiM-Hyperlocal",
    Accept: "application/json",
  };
}

async function sierraGet(
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
      headers: buildHeaders(conn),
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
    throw new Error(`Sierra ${res.status}: ${err.message ?? res.statusText}`);
  }
  return data;
}

function extractLeads(data: unknown): SierraLead[] {
  const r = data as SierraFindResponse;
  return r.data?.leads ?? r.leads ?? [];
}

function normalize(
  conn: HlCrmConnection,
  l: SierraLead
): NormalizedContact | null {
  if (!l.email || !isValidEmail(l.email)) return null;
  const tags = l.tags ?? [];
  const customFieldValue =
    conn.search_area_column && l.customFields
      ? (l.customFields[conn.search_area_column] as string | undefined)
      : undefined;

  return {
    external_id: String(l.id),
    first_name: l.firstName ?? "",
    last_name: l.lastName ?? "",
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

export const sierraConnector: CrmConnector = {
  async testConnection(conn) {
    try {
      const data = await sierraGet(conn, "/leads/find", {
        pageNumber: 1,
        pageSize: 1,
      });
      const leads = extractLeads(data);
      return {
        ok: true,
        sample: leads[0] ? normalize(conn, leads[0]) ?? undefined : undefined,
        contact_count_estimate:
          (data as SierraFindResponse).data?.totalCount ??
          (data as SierraFindResponse).totalCount,
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
      const data = await sierraGet(conn, "/leads/find", {
        pageNumber: page,
        pageSize,
      });
      const batch = extractLeads(data);
      if (batch.length === 0) break;
      for (const l of batch) {
        const n = normalize(conn, l);
        if (n) all.push(n);
        if (all.length >= totalCap) break;
      }
      if (batch.length < pageSize) break;
      page += 1;
    }
    return dedupeByEmail(all);
  },
};
