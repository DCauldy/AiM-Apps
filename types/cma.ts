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
  resend_webhook_secret_encrypted?: string | null;

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

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/** Subject property facts cached on cma_clients.property_facts so the
 *  cadence pipeline doesn't re-run RapidAPI lookups on every delivery.
 *  Same shape PropertyFacts uses for the CMA pipeline input. */
export interface CmaClientPropertyFacts {
  zpid?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  beds?: number | null;
  baths?: number | null;
  living_area_sqft?: number | null;
  lot_area_sqft?: number | null;
  year_built?: number | null;
  property_type?: string | null;
  garage_spaces?: number | null;
  image_url?: string | null;
  estimated_value_cents?: number | null;
}

export interface CmaClient {
  id: string;
  user_id: string;
  profile_id: string | null;

  crm_connection_id: string | null;
  crm_contact_id: string | null;
  source: "crm" | "manual";

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_normalized: string | null;

  property_facts: CmaClientPropertyFacts;

  enrolled: boolean;
  paused: boolean;
  cadence_days: number | null;
  next_due_at: string | null;
  last_delivered_at: string | null;
  delivered_count: number;
  unsubscribed_at: string | null;

  created_at: string;
  updated_at: string;
}

/** Per-cadence-cycle delivery record. 1 row per CMA actually delivered. */
export interface CmaClientDelivery {
  id: string;
  client_id: string;
  cma_run_id: string | null;
  email_connection_id: string | null;

  landing_page_token: string;
  email_subject: string | null;
  email_html: string | null;

  /** ESP-side message id (Resend email_id, SendGrid sg_message_id).
   *  Webhook handlers look up the row by this column. */
  provider_message_id: string | null;

  delivered_at: string | null;
  send_error: string | null;

  opened_at: string | null;
  opened_count: number;
  clicked_at: string | null;
  clicked_count: number;
  replied_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;

  recommended_price_cents: number | null;
  estimated_value_cents: number | null;
  marketable_value_cents: number | null;

  trigger_source: "cadence" | "manual" | "first_enrollment";

  created_at: string;
}

/** What a client looks like in the agent's list view — slim projection
 *  + a derived engagement state for the filter chip. */
export interface CmaClientSummary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  address: string | null;
  enrolled: boolean;
  paused: boolean;
  unsubscribed_at: string | null;
  cadence_days: number | null;
  next_due_at: string | null;
  last_delivered_at: string | null;
  delivered_count: number;
  /** Derived from the latest cma_client_deliveries row's state.
   *  Priority order (most actionable first):
   *    "complained" > "bounced" > "clicked" > "opened" > "delivered"
   *    > "cold" > "none"
   *  bounced/complained surface as red badges on the list so agents
   *  fix the address (or drop the client) before the next cadence. */
  engagement:
    | "complained"
    | "bounced"
    | "clicked"
    | "opened"
    | "delivered"
    | "cold"
    | "none";
}

export type CmaClientFilter =
  | "all"
  | "pending"
  | "enrolled"
  | "paused"
  | "unsubscribed";

export interface CmaClientsListResponse {
  clients: CmaClientSummary[];
  counts: Record<CmaClientFilter, number>;
}

export interface CmaClientDetailResponse {
  client: CmaClient;
  deliveries: CmaClientDelivery[];
}

export interface CmaClientPatchBody {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  property_facts?: Partial<CmaClientPropertyFacts>;
  enrolled?: boolean;
  paused?: boolean;
  cadence_days?: number | null;
}

export type CmaClientBulkAction = "enroll" | "unenroll" | "pause" | "resume";

export interface CmaClientBulkRequest {
  client_ids: string[];
  action: CmaClientBulkAction;
  /** Optional cadence override applied alongside enroll/resume. */
  cadence_days?: number | null;
}

export interface CmaClientBulkResponse {
  ok: string[];
  failed: Array<{ id: string; error: string }>;
}
