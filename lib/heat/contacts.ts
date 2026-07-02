import "server-only";

import { getConnector } from "@/lib/hyperlocal/crm";
import { decrypt } from "@/lib/hyperlocal/encryption";
import type { PlatformCrmConnection } from "@/types/platform-connections";

// ============================================================
// Heat contacts — SERVER-SIDE search for the Share typeahead.
//
// Two reasons we don't reuse the shared connector's fetchContacts here:
//   1) It drops contacts without a valid email (email-campaign origin) —
//      but Heat texts, so phone-only contacts matter. We keep email OR phone.
//   2) It pulls a capped page of the whole book. Real books are huge
//      (one test account: 23k contacts), so a recent-contact would never
//      appear. FUB supports ?name= search, so we query the CRM directly.
//
// FUB is implemented natively; other CRMs fall back to a bounded fetch +
// client-side filter until given the same treatment.
// ============================================================

export interface HeatContact {
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
}

interface FubPerson {
  firstName?: string | null;
  lastName?: string | null;
  emails?: Array<{ value?: string | null }>;
  phones?: Array<{ value?: string | null }>;
  tags?: string[];
}

function mapFub(p: FubPerson): HeatContact | null {
  const email = p.emails?.find((e) => e.value)?.value ?? null;
  const phone = p.phones?.find((ph) => ph.value)?.value ?? null;
  if (!email && !phone) return null; // keep email OR phone
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || email || phone || "Unknown",
    email: email ? email.toLowerCase() : null,
    phone,
    tags: p.tags ?? [],
  };
}

async function searchFub(
  conn: PlatformCrmConnection,
  query: string,
  limit: number,
): Promise<HeatContact[]> {
  if (!conn.api_key_encrypted) return [];
  const auth = "Basic " + Buffer.from(decrypt(conn.api_key_encrypted) + ":").toString("base64");
  const url = new URL("https://api.followupboss.com/v1/people");
  url.searchParams.set("limit", String(limit));
  if (query) url.searchParams.set("name", query); // FUB server-side name search
  else url.searchParams.set("sort", "-created"); // default: most recent

  const res = await fetch(url.toString(), {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return [];

  const data = (await res.json().catch(() => null)) as { people?: FubPerson[] } | null;
  return (data?.people ?? []).map(mapFub).filter((c): c is HeatContact => c !== null);
}

/**
 * Search the agent's CRM for the Share modal. `query` empty → recent contacts.
 * `phoneOnlySupported` tells the UI whether phone-only contacts are included.
 */
export async function searchHeatContacts(
  conn: PlatformCrmConnection,
  query: string,
  limit = 20,
): Promise<{ contacts: HeatContact[]; phoneOnlySupported: boolean }> {
  if (conn.platform === "followupboss") {
    return { contacts: await searchFub(conn, query, limit), phoneOnlySupported: true };
  }

  // Fallback: shared connector (email-only), bounded fetch + client filter.
  const fetched = await getConnector(conn.platform).fetchContacts(conn, { limit: 2000 });
  const q = query.trim().toLowerCase();
  const contacts = fetched
    .filter((c) => c.email || c.phone)
    .map((c) => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      email: c.email ?? null,
      phone: c.phone ?? null,
      tags: c.tags ?? [],
    }))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q))
    .slice(0, limit);
  return { contacts, phoneOnlySupported: false };
}
