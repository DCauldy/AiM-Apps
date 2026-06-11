import type { CmaClientCandidate, CmaCrmConnection } from "@/types/cma";

// ============================================================
// CMA CRM connector interface.
//
// Mirrors the Hyperlocal CrmConnector shape but yields a different
// output type — past-client candidates ready for cma_clients ingest,
// not a generic NormalizedContact. Each wrapper internally delegates
// HTTP + pagination + auth to the corresponding Hyperlocal connector
// (synthesizing an HlCrmConnection shim from the CmaCrmConnection),
// then filters + reshapes the results.
// ============================================================

export interface CmaFetchOptions {
  /** Total candidates to fetch (across pages). */
  limit?: number;
  pageSize?: number;
}

export interface CmaTestConnectionResult {
  ok: boolean;
  sample?: CmaClientCandidate;
  /** Provider's reported contact total — usually larger than the
   *  CMA-eligible count because most contacts aren't past clients
   *  with stored addresses. */
  contact_count_estimate?: number;
  error?: string;
}

export interface CmaCrmConnector {
  testConnection(c: CmaCrmConnection): Promise<CmaTestConnectionResult>;
  fetchPastClients(
    c: CmaCrmConnection,
    opts?: CmaFetchOptions,
  ): Promise<CmaClientCandidate[]>;
}
