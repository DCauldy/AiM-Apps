import { decrypt } from "@/lib/hyperlocal/encryption";
import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const DEFAULT_BASE = "https://api.lofty.com/v1";

interface LoftyLead {
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
  /** Lofty's lead stage / status field. The API exposes both `stage` and
   *  `leadStatus` on different lead types; we read whichever is present
   *  so CmaCrmConnection past-client filters can match on either. */
  stage?: string | null;
  leadStatus?: string | null;
}

interface LoftyLeadsResponse {
  data?: LoftyLead[];
  leads?: LoftyLead[];
  total?: number;
  pageSize?: number;
  page?: number;
}

function authHeader(conn: HlCrmConnection): string {
  if (!conn.api_key_encrypted) {
    throw new Error("Lofty API key not configured for this connection");
  }
  return "Bearer " + decrypt(conn.api_key_encrypted);
}

async function loftyGet(
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
    throw new Error(
      `Lofty ${res.status}: ${err.message ?? res.statusText}`
    );
  }
  return data;
}

function normalize(
  conn: HlCrmConnection,
  l: LoftyLead
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
    raw_stage: l.stage ?? l.leadStatus ?? undefined,
  };
}

function extractLeads(data: unknown): LoftyLead[] {
  const r = data as LoftyLeadsResponse;
  return r.data ?? r.leads ?? [];
}

export const loftyConnector: CrmConnector = {
  async testConnection(conn) {
    try {
      const data = await loftyGet(conn, "/leads", { pageSize: 1 });
      const leads = extractLeads(data);
      return {
        ok: true,
        sample: leads[0] ? normalize(conn, leads[0]) ?? undefined : undefined,
        contact_count_estimate: (data as LoftyLeadsResponse).total,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  async fetchContacts(conn, opts = {}) {
    const pageSize = Math.min(opts.pageSize ?? 100, 200);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let page = 1;

    while (all.length < totalCap) {
      const data = await loftyGet(conn, "/leads", { page, pageSize });
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
