import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";

/**
 * Extract search areas from a contact based on the connection's configuration.
 * - If search_area_source is 'field', read from that column (split on commas)
 * - If search_area_source is 'tag-pattern', regex-match tags
 * - If 'none' or unset, returns empty
 */
export function extractSearchAreas(
  conn: HlCrmConnection,
  rawFieldValue: string | undefined,
  tags: string[]
): string[] {
  const source = conn.search_area_source ?? "none";
  if (source === "field") {
    if (!rawFieldValue) return [];
    return splitAndTrim(rawFieldValue);
  }
  if (source === "tag-pattern" && conn.search_area_tag_pattern) {
    try {
      // Convert wildcard-style pattern (e.g. "looking-in-*") to regex
      const pattern = conn.search_area_tag_pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "(.+)");
      const regex = new RegExp(`^${pattern}$`, "i");
      const matches: string[] = [];
      for (const tag of tags) {
        const m = regex.exec(tag);
        if (m && m[1]) matches.push(m[1].trim());
      }
      return matches;
    } catch {
      return [];
    }
  }
  return [];
}

function splitAndTrim(s: string): string[] {
  return s
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Deduplicate contacts by email (case-insensitive). The first occurrence wins.
 */
export function dedupeByEmail(
  contacts: NormalizedContact[]
): NormalizedContact[] {
  const seen = new Set<string>();
  const out: NormalizedContact[] = [];
  for (const c of contacts) {
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Validate that an email looks deliverable (rough RFC check).
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Pick the "home" address from a list of nested addresses (FUB-style).
 * Falls back to the first address if no explicit home type.
 */
export function pickHomeAddress<
  T extends {
    type?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    code?: string | null;
    zip?: string | null;
  },
>(addresses: T[]): {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
} | undefined {
  if (!addresses || addresses.length === 0) return undefined;
  const home = addresses.find((a) => a.type?.toLowerCase() === "home");
  const pick = home ?? addresses[0];
  return {
    street: pick.street ?? undefined,
    city: pick.city ?? undefined,
    state: pick.state ?? undefined,
    zip: pick.code ?? pick.zip ?? undefined,
  };
}
