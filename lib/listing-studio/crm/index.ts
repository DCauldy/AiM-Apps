import type { NormalizedContact } from "@/types/hyperlocal";
import type { CmaClientCandidate } from "@/types/cma";
import type {
  CmaCrmFilterConfig,
  PlatformCrmConnection,
} from "@/types/platform-connections";
import { getConnector as getHlConnector } from "@/lib/hyperlocal/crm";
import type {
  CmaCrmConnector,
  CmaFetchOptions,
  CmaTestConnectionResult,
} from "./types";

// ============================================================
// CMA CRM connector — directly calls the Hyperlocal connectors
// with the new shared shape (Wave 10, no shim).
//
// The Hyperlocal layer owns HTTP + pagination + auth + retry for
// every supported CRM. CMA bolts two concerns on top:
//
//   1. Past-client filtering — drop everyone whose tag/stage doesn't
//      match the agent's cma filter_config.
//   2. Address-required reshape — drop anyone without a property
//      address, reshape the survivors as CmaClientCandidate.
//
// Same connector implementation for every platform — per-provider
// variation is encapsulated below in the Hyperlocal layer. Adding a
// 5th CRM = expand the Hyperlocal layer + extend the platform CHECK
// on platform_crm_connections + extend CmaCrmPlatform. Nothing in
// this file changes.
// ============================================================

function buildConnector(): CmaCrmConnector {
  return {
    async testConnection(
      conn: PlatformCrmConnection,
      filter: CmaCrmFilterConfig,
    ): Promise<CmaTestConnectionResult> {
      const hl = getHlConnector(conn.platform);
      // No HL search-area filter — CMA doesn't use that concept.
      // The Hyperlocal connector returns NormalizedContact[] without
      // an opinion on search areas.
      const result = await hl.testConnection(conn);
      if (!result.ok) return { ok: false, error: result.error };

      // Sample preview: if the test fetched a sample contact with an
      // address, surface it as a CmaClientCandidate so the agent can
      // spot-check the filter before kicking off a full sync.
      const candidate = result.sample ? toCandidate(result.sample) : null;
      // Show the candidate only if it ALSO passes the past-client
      // filter — otherwise the preview misleads.
      const isPastClient = pastClientFilter(filter);
      const passed = result.sample && isPastClient(result.sample);
      return {
        ok: true,
        sample: passed ? (candidate ?? undefined) : undefined,
        contact_count_estimate: result.contact_count_estimate,
      };
    },

    async fetchPastClients(
      conn: PlatformCrmConnection,
      filter: CmaCrmFilterConfig,
      opts: CmaFetchOptions = {},
    ): Promise<CmaClientCandidate[]> {
      const hl = getHlConnector(conn.platform);
      // Pull broadly, filter locally. Most CRMs don't expose a
      // server-side filter on stage that's consistent across providers;
      // the v2 scope (hundreds-low-thousands of contacts) makes the
      // local filter cost negligible.
      const all = await hl.fetchContacts(conn, opts);
      const isPastClient = pastClientFilter(filter);
      const candidates: CmaClientCandidate[] = [];
      for (const c of all) {
        if (!isPastClient(c)) continue;
        const cand = toCandidate(c);
        if (cand) candidates.push(cand);
      }
      return candidates;
    },
  };
}

// Single shared instance — connector holds no per-request state.
const CMA_CONNECTOR: CmaCrmConnector = buildConnector();

export function getCmaCrmConnector(_platform: PlatformCrmConnection["platform"]): CmaCrmConnector {
  // Same connector for every platform — kept the platform arg so
  // call-sites read symmetrically with Hyperlocal's getConnector().
  return CMA_CONNECTOR;
}

// ---------------------------------------------------------------------------
// Past-client filter + candidate reshape (formerly lib/.../shared.ts)
// ---------------------------------------------------------------------------

/**
 * Test whether a contact matches the agent's past-client filter.
 *
 * source "all"   — every contact qualifies
 * source "tag"   — value must appear in the contact's tag list
 *                  (case-insensitive)
 * source "stage" — contact's raw_stage must equal the value
 *                  (case-insensitive). Drops contacts where the
 *                  provider didn't expose a stage.
 * source null    — nothing qualifies until configured
 */
export function pastClientFilter(
  filter: CmaCrmFilterConfig,
): (c: NormalizedContact) => boolean {
  const source = filter.past_client_source ?? null;
  const value = filter.past_client_value ?? null;
  if (source === "all") return () => true;
  if (!source || !value) return () => false;
  const v = value.trim().toLowerCase();
  if (source === "tag") {
    return (c) => c.tags.some((t) => t.trim().toLowerCase() === v);
  }
  // source === "stage"
  return (c) => (c.raw_stage ?? "").trim().toLowerCase() === v;
}

/**
 * Build a single-line address string from the CRM's component parts.
 * Returns null when the address is too sparse to be useful (no street
 * AND no city = nothing to look up).
 */
function composeAddress(
  parts: NonNullable<NormalizedContact["home_address"]>,
): { display: string; normalized: string } | null {
  const street = parts.street?.trim() ?? "";
  const city = parts.city?.trim() ?? "";
  const state = parts.state?.trim() ?? "";
  const zip = parts.zip?.trim() ?? "";

  if (!street && !city) return null;

  const pieces: string[] = [];
  if (street) pieces.push(street);
  if (city) pieces.push(city);
  if (state || zip) pieces.push([state, zip].filter(Boolean).join(" "));

  const display = pieces.join(", ");
  const normalized = display.toLowerCase().replace(/\s+/g, " ").trim();
  return { display, normalized };
}

/**
 * Reshape a Hyperlocal NormalizedContact into a CMA candidate. Returns
 * null when the contact lacks a usable address — the CMA product
 * fundamentally requires a property to run a CMA against.
 */
export function toCandidate(c: NormalizedContact): CmaClientCandidate | null {
  if (!c.home_address) return null;
  const addr = composeAddress(c.home_address);
  if (!addr) return null;

  return {
    crm_contact_id: c.external_id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    address: addr.display,
    address_normalized: addr.normalized,
    address_parts: {
      street: c.home_address.street,
      city: c.home_address.city,
      state: c.home_address.state,
      zip: c.home_address.zip,
    },
    raw_stage: c.raw_stage,
    tags: c.tags,
  };
}

export type { CmaCrmConnector, CmaTestConnectionResult, CmaFetchOptions };
