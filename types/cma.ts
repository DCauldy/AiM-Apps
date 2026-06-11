// CMA domain types — shared between API routes, server pages, and
// client components. Mirrors the cma_* DB schema in
// supabase/migrations/20260610000001_cma_pivot_schema_rip.sql.
//
// The CMA app is a v2 pivot of Listing Studio. User-facing copy says
// "CMA" everywhere; internal slug stays "listing_studio" in DB tables
// (admin_pack_configs, ls_user_packs, ls_usage, ls_cma_runs) and in
// the API namespace (/api/apps/listing-studio/*) to avoid migration
// churn.

import type { EmailProvider } from "./hyperlocal";

// ---------------------------------------------------------------------------
// CRM connections
// ---------------------------------------------------------------------------

/** CRMs the CMA app integrates with. Subset of Hyperlocal's CRM scope —
 *  we don't need CSV (clients come from a live connected CRM) or the
 *  long-tail platforms Hyperlocal supports. */
export type CmaCrmPlatform =
  | "followupboss"
  | "lofty"
  | "sierra"
  | "boldtrail";

/** How the agent identifies past clients within their CRM. */
export type PastClientSource = "tag" | "stage" | "all";

export interface CmaCrmConnection {
  id: string;
  user_id: string;
  profile_id: string | null;

  platform: CmaCrmPlatform;
  label?: string | null;

  api_key_encrypted?: string | null;
  oauth_access_token_encrypted?: string | null;
  oauth_refresh_token_encrypted?: string | null;
  oauth_expires_at?: string | null;
  base_url?: string | null;

  /** "tag" means past_client_value names a tag the agent applies
   *  ("Closed Client"). "stage" means past_client_value names the
   *  pipeline stage that represents past clients ("Closed"). "all"
   *  means no filter — enroll every contact with an address. */
  past_client_source: PastClientSource | null;
  past_client_value: string | null;

  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Email connections
// ---------------------------------------------------------------------------

/** Same set as Hyperlocal — we reuse the email provider adapter layer. */
export type CmaEmailProvider = EmailProvider;

export interface CmaEmailConnection {
  id: string;
  user_id: string;
  profile_id: string | null;

  provider: CmaEmailProvider;
  email_address: string;
  display_name?: string | null;

  // Resend-specific (dedicated domain + DKIM verification flow)
  resend_api_key_encrypted?: string | null;
  resend_domain?: string | null;
  resend_domain_id?: string | null;
  resend_dkim_status?: "pending" | "verified" | "failed" | null;
  resend_webhook_id?: string | null;

  // Generic provider credentials (everything not Resend)
  provider_api_key_encrypted?: string | null;
  provider_oauth_access_token_encrypted?: string | null;
  provider_oauth_refresh_token_encrypted?: string | null;
  provider_oauth_expires_at?: string | null;
  provider_metadata: Record<string, unknown>;

  is_active: boolean;
  is_default: boolean;
  last_send_at: string | null;
  last_error: string | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Past-client candidate (what CRM connectors yield)
// ---------------------------------------------------------------------------

/** A NormalizedContact that survived the past-client filter AND has a
 *  usable property address. Ready to upsert into cma_clients. */
export interface CmaClientCandidate {
  /** Provider-native contact id (FUB person id, Lofty lead id, etc.). */
  crm_contact_id: string;

  first_name: string;
  last_name: string;
  email: string;
  phone?: string;

  /** Full address as one display string — what we hand to RapidAPI's
   *  /property endpoint for zpid + lat/lon resolution. Built by joining
   *  the CRM's address parts in their canonical order. */
  address: string;
  /** Lowercased + trimmed for dedup checks. */
  address_normalized: string;

  /** Component parts kept for later edits / display. */
  address_parts: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };

  /** Verbatim stage value from the CRM (e.g. "Closed Buyer"). Useful
   *  in the agent-facing review UI so they can spot-check the filter. */
  raw_stage?: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Public API response shapes
// ---------------------------------------------------------------------------

export interface CmaCrmConnectionsListResponse {
  connections: Array<Omit<CmaCrmConnection,
    | "api_key_encrypted"
    | "oauth_access_token_encrypted"
    | "oauth_refresh_token_encrypted"
  >>;
}

export interface CmaCrmConnectionResponse {
  connection: Omit<CmaCrmConnection,
    | "api_key_encrypted"
    | "oauth_access_token_encrypted"
    | "oauth_refresh_token_encrypted"
  >;
}

export interface CmaCrmSyncResponse {
  candidates_total: number;
  /** Net new candidates created in cma_clients (not yet enrolled). */
  candidates_created: number;
  /** Existing candidates whose address/contact info was refreshed. */
  candidates_updated: number;
  /** Candidates whose address became invalid since last sync. */
  candidates_dropped: number;
  /** First few candidates for the agent review screen. */
  preview: CmaClientCandidate[];
}

export interface CmaEmailConnectionsListResponse {
  connections: Array<Omit<CmaEmailConnection,
    | "resend_api_key_encrypted"
    | "provider_api_key_encrypted"
    | "provider_oauth_access_token_encrypted"
    | "provider_oauth_refresh_token_encrypted"
  >>;
}
