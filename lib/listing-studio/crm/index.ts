import type { CmaClientCandidate, CmaCrmConnection } from "@/types/cma";
import { getConnector as getHlConnector } from "@/lib/hyperlocal/crm";
import type {
  CmaCrmConnector,
  CmaFetchOptions,
  CmaTestConnectionResult,
} from "./types";
import { pastClientFilter, toCandidate, toHlShim } from "./shared";

// ============================================================
// CMA CRM connector — single factory that wraps the Hyperlocal
// connector for each supported platform.
//
// The Hyperlocal layer is the source of truth for HTTP + pagination +
// auth + retry logic for FUB / Lofty / Sierra / BoldTrail. The CMA
// wrapper bolts two concerns on top:
//
//   1. Past-client filtering — drop everyone whose tag/stage doesn't
//      match what the agent configured on the cma_crm_connections row.
//   2. Address-required reshape — drop anyone without a property
//      address, and reshape the survivors as CmaClientCandidate so
//      callers don't have to know about NormalizedContact.
//
// Same connector implementation works for all four platforms because
// the Hyperlocal layer already abstracts the per-provider differences.
// Adding a 5th CRM = expand the Hyperlocal layer + extend the platform
// CHECK on cma_crm_connections. Nothing in this file changes.
// ============================================================

function buildConnector(): CmaCrmConnector {
  return {
    async testConnection(
      conn: CmaCrmConnection,
    ): Promise<CmaTestConnectionResult> {
      const hl = getHlConnector(conn.platform);
      const result = await hl.testConnection(toHlShim(conn));
      if (!result.ok) return { ok: false, error: result.error };

      // Sample preview: if the test fetched a sample contact AND that
      // contact has an address, surface it as a CmaClientCandidate so
      // the agent can spot-check the filter before kicking off a full
      // sync. Otherwise just confirm the connection is alive.
      const candidate = result.sample ? toCandidate(result.sample) : null;
      return {
        ok: true,
        sample: candidate ?? undefined,
        contact_count_estimate: result.contact_count_estimate,
      };
    },

    async fetchPastClients(
      conn: CmaCrmConnection,
      opts?: CmaFetchOptions,
    ): Promise<CmaClientCandidate[]> {
      const hl = getHlConnector(conn.platform);
      // Pull the full contact list, then filter on the agent's stage/tag
      // rule. Most CRMs don't expose a server-side filter on stage that's
      // consistent across providers, so we pull broadly and filter
      // locally. Acceptable for the v2 scope (agents typically have
      // hundreds-low-thousands of contacts, not millions).
      const all = await hl.fetchContacts(toHlShim(conn), opts);
      const isPastClient = pastClientFilter(
        conn.past_client_source,
        conn.past_client_value,
      );
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

export function getCmaCrmConnector(_platform: CmaCrmConnection["platform"]): CmaCrmConnector {
  // Same connector for every platform — the per-provider variation is
  // already encapsulated below us in the Hyperlocal layer. We still
  // take the platform arg so call-sites read symmetrically with
  // Hyperlocal's getConnector(platform).
  return CMA_CONNECTOR;
}

export type { CmaCrmConnector, CmaTestConnectionResult, CmaFetchOptions };
