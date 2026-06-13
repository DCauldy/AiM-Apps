import type { CmaClientCandidate } from "@/types/cma";
import type {
  CmaCrmFilterConfig,
  PlatformCrmConnection,
} from "@/types/platform-connections";

// ============================================================
// CMA CRM connector interface.
//
// Built directly on top of the shared Hyperlocal connectors — no
// shim layer (Wave 10 deleted lib/listing-studio/crm/shared.ts).
// Functions take a PlatformCrmConnection (auth + identity from the
// new shared table) plus the CMA-specific filter config (the
// stage/tag/all rule).
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
  testConnection(
    conn: PlatformCrmConnection,
    filter: CmaCrmFilterConfig,
  ): Promise<CmaTestConnectionResult>;
  fetchPastClients(
    conn: PlatformCrmConnection,
    filter: CmaCrmFilterConfig,
    opts?: CmaFetchOptions,
  ): Promise<CmaClientCandidate[]>;
}
