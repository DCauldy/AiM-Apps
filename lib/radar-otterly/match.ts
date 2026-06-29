import type { OtterlyBrandReport } from "./types";

// ============================================================
// Match a profile's website_url to its Otterly brand report.
//
// Otterly's data model expects one report per `brandDomain`, with
// optional `brandDomainVariations` for aliases (e.g. adidas.com +
// adidas.de + adidas.co.uk are one brand). The agent's
// platform_profiles.website_url is the input; we extract the
// hostname (stripping www., scheme, path, query) and check it
// against the report's primary domain + variations.
// ============================================================

/** Strip scheme, www, path, query, port from a URL or hostname-like
 *  string. Returns the bare hostname lowercased, or null when the
 *  input doesn't contain something parseable as a host. */
export function normalizeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Best-effort parse — try as a full URL first (handles scheme +
  // path + port cleanly), fall back to treating the input as a
  // bare hostname.
  let host: string;
  try {
    const url = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    host = url.hostname;
  } catch {
    // URL constructor choked — strip obvious noise and accept the rest.
    host = trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
  }

  host = host.toLowerCase().replace(/^www\./, "");
  return host || null;
}

/** Find the brand report whose brandDomain (or one of its
 *  brandDomainVariations) matches the given hostname. Returns null
 *  when no report matches — caller should surface the "no brand
 *  report configured yet" gating panel. */
export function findReportForHostname(
  reports: OtterlyBrandReport[],
  hostname: string | null,
): OtterlyBrandReport | null {
  if (!hostname) return null;
  const target = hostname.toLowerCase();
  for (const report of reports) {
    const candidates = [report.brandDomain, ...report.brandDomainVariations]
      .map((d) => d?.toLowerCase().replace(/^www\./, ""))
      .filter(Boolean);
    if (candidates.includes(target)) return report;
    // Wildcard support: when brandDomainWildcard is set, treat the
    // primary domain as matching any subdomain (foo.adidas.com → adidas.com).
    if (report.brandDomainWildcard) {
      const primary = report.brandDomain.toLowerCase().replace(/^www\./, "");
      if (target === primary || target.endsWith(`.${primary}`)) return report;
    }
  }
  return null;
}
