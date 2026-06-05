import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";

export interface FetchContactsOptions {
  limit?: number;        // total contacts to fetch (across pages)
  pageSize?: number;     // per request
}

export interface TestConnectionResult {
  ok: boolean;
  sample?: NormalizedContact;
  contact_count_estimate?: number;
  error?: string;
}

export interface CrmConnector {
  testConnection(c: HlCrmConnection): Promise<TestConnectionResult>;
  fetchContacts(
    c: HlCrmConnection,
    opts?: FetchContactsOptions
  ): Promise<NormalizedContact[]>;
}
