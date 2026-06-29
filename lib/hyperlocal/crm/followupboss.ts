import { decrypt } from "@/lib/hyperlocal/encryption";
import type { NormalizedContact } from "@/types/hyperlocal";
import type {
  HlCrmFilterConfig,
  PlatformCrmConnection,
} from "@/types/platform-connections";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import {
  dedupeByEmail,
  extractSearchAreas,
  isValidEmail,
  pickHomeAddress,
} from "./normalize";

const BASE_URL = "https://api.followupboss.com/v1";

interface FubAddress {
  type?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  code?: string | null;
}

interface FubPerson {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  emails?: Array<{ value: string; type?: string | null }>;
  phones?: Array<{ value: string; type?: string | null }>;
  addresses?: FubAddress[];
  tags?: string[];
  source?: string | null;
  customFields?: Record<string, string | number | null>;
  /** FUB's lead pipeline stage (e.g. "Lead", "Active Buyer", "Closed").
   *  Exposed verbatim via NormalizedContact.raw_stage so the CMA app can
   *  filter past clients by stage value. */
  stage?: string | null;
}

interface FubPeopleResponse {
  people: FubPerson[];
  _metadata?: { total?: number; offset?: number; limit?: number };
}

function authHeader(conn: PlatformCrmConnection): string {
  if (!conn.api_key_encrypted) {
    throw new Error("FUB API key not configured for this connection");
  }
  const key = decrypt(conn.api_key_encrypted);
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function fubGet(
  conn: PlatformCrmConnection,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const url = new URL(BASE_URL + path);
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
    const err = data as { message?: string; errorMessage?: string };
    throw new Error(
      `FUB ${res.status}: ${err.message ?? err.errorMessage ?? res.statusText}`,
    );
  }
  return data;
}

function normalize(
  filter: HlCrmFilterConfig | undefined,
  p: FubPerson,
): NormalizedContact | null {
  const email = p.emails?.find((e) => e.value && isValidEmail(e.value))?.value;
  if (!email) return null;

  const tags = p.tags ?? [];
  const customFieldValue =
    filter?.search_area_column && p.customFields
      ? (p.customFields[filter.search_area_column] as string | undefined)
      : undefined;

  return {
    external_id: String(p.id),
    first_name: p.firstName ?? "",
    last_name: p.lastName ?? "",
    email: email.toLowerCase(),
    phone: p.phones?.[0]?.value ?? undefined,
    home_address: pickHomeAddress(p.addresses ?? []),
    search_areas: extractSearchAreas(filter, customFieldValue, tags),
    tags,
    source: p.source ?? undefined,
    raw_stage: p.stage ?? undefined,
  };
}

export const followupbossConnector: CrmConnector = {
  async testConnection(
    conn: PlatformCrmConnection,
    filter?: HlCrmFilterConfig,
  ): Promise<TestConnectionResult> {
    try {
      const data = (await fubGet(conn, "/people", {
        limit: 1,
      })) as FubPeopleResponse;
      const first = data.people?.[0];
      return {
        ok: true,
        sample: first ? normalize(filter, first) ?? undefined : undefined,
        contact_count_estimate: data._metadata?.total,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  async fetchContacts(
    conn: PlatformCrmConnection,
    opts: FetchContactsOptions = {},
  ): Promise<NormalizedContact[]> {
    const pageSize = Math.min(opts.pageSize ?? 100, 100);
    const totalCap = opts.limit ?? 25_000;
    const all: NormalizedContact[] = [];
    let offset = 0;

    while (all.length < totalCap) {
      const data = (await fubGet(conn, "/people", {
        limit: pageSize,
        offset,
        sort: "created",
      })) as FubPeopleResponse;
      const batch = data.people ?? [];
      if (batch.length === 0) break;
      for (const p of batch) {
        const n = normalize(opts.filter, p);
        if (n) all.push(n);
        if (all.length >= totalCap) break;
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    return dedupeByEmail(all);
  },
};
