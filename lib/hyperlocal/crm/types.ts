import type { NormalizedContact } from "@/types/hyperlocal";
import type {
  HlCrmFilterConfig,
  PlatformCrmConnection,
} from "@/types/platform-connections";

// ============================================================
// Hyperlocal CRM connector contract.
//
// Connectors now take the SHARED PlatformCrmConnection (Wave 9) for
// auth + an optional Hyperlocal-specific filter config. The filter is
// optional so cross-app callers (CMA reusing Hyperlocal connectors)
// can fetch contacts without applying Hyperlocal's search-area filter.
// ============================================================

export interface FetchContactsOptions {
  limit?: number; // total contacts to fetch (across pages)
  pageSize?: number; // per request
  /** Hyperlocal-only search-area filter. CMA passes nothing. */
  filter?: HlCrmFilterConfig;
}

export interface TestConnectionResult {
  ok: boolean;
  sample?: NormalizedContact;
  contact_count_estimate?: number;
  error?: string;
}

export interface CrmConnector {
  testConnection(
    conn: PlatformCrmConnection,
    filter?: HlCrmFilterConfig,
  ): Promise<TestConnectionResult>;
  fetchContacts(
    conn: PlatformCrmConnection,
    opts?: FetchContactsOptions,
  ): Promise<NormalizedContact[]>;
}
