// ============================================================
// Shared platform-level connection types.
//
// Wave 9 of the CMA build collapsed the per-app
// hl_/cma_ connection tables into a shared layer with per-app
// state on top. Schema reference:
//   supabase/migrations/20260613000001_platform_connections.sql
//
// Shape:
//   platform_*_connections    → identity + auth (shared across apps)
//   app_*_connection_state    → filter config + send state (per app)
//
// Apps consume connections via the shared row + their own state row
// joined by connection_id. Adding a new app = expand `AppSlug` +
// register a per-app filter / state shape below.
// ============================================================

import type {
  CrmPlatform,
  CsvColumnMapping,
  EmailProvider,
  SearchAreaSource,
} from "./hyperlocal";
import type { PastClientSource } from "./cma";

// ---------------------------------------------------------------------------
// App identifier
// ---------------------------------------------------------------------------

/** Internal app slug stored on app_*_connection_state.app. Listing
 *  Studio kept its original slug ("listing_studio") even after the
 *  CMA rebrand to avoid migration churn. New apps add a value here +
 *  expand the CHECK on both app_state tables. */
export type AppSlug = "hyperlocal" | "listing_studio";

// ---------------------------------------------------------------------------
// CRM — shared identity + auth
// ---------------------------------------------------------------------------

export interface PlatformCrmConnection {
  id: string;
  user_id: string;
  /** profile_id is NOT NULL on the new schema — connections always
   *  belong to a profile. The settings UI gates creation on having
   *  an active profile. */
  profile_id: string;

  platform: CrmPlatform;
  label: string | null;

  api_key_encrypted: string | null;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_expires_at: string | null;
  base_url: string | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Public projection — same as above with auth blobs stripped. The
 *  GET endpoints return this; client code never sees encrypted keys. */
export type PlatformCrmConnectionPublic = Omit<
  PlatformCrmConnection,
  | "api_key_encrypted"
  | "oauth_access_token_encrypted"
  | "oauth_refresh_token_encrypted"
>;

// ---------------------------------------------------------------------------
// CRM — per-app filter config shapes
// ---------------------------------------------------------------------------

/** Hyperlocal's filter config. Drives which contacts qualify for a
 *  campaign (search-area filter) + how to parse CSV uploads. */
export interface HlCrmFilterConfig {
  search_area_source?: SearchAreaSource | null;
  search_area_column?: string | null;
  search_area_tag_pattern?: string | null;
  column_mapping?: CsvColumnMapping | null;
}

/** CMA's filter config. Drives which contacts qualify as past clients
 *  (stage / tag matching). Wave 2-3 spec. */
export interface CmaCrmFilterConfig {
  past_client_source?: PastClientSource | null;
  past_client_value?: string | null;
}

/** Discriminated union by `app` so call sites can refine the
 *  filter_config shape after checking the app field. */
export type AppCrmConnectionState =
  | {
      id: string;
      connection_id: string;
      app: "hyperlocal";
      filter_config: HlCrmFilterConfig;
      last_synced_at: string | null;
      last_error: string | null;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      connection_id: string;
      app: "listing_studio";
      filter_config: CmaCrmFilterConfig;
      last_synced_at: string | null;
      last_error: string | null;
      created_at: string;
      updated_at: string;
    };

// ---------------------------------------------------------------------------
// Email — shared provider + domain
// ---------------------------------------------------------------------------

export interface PlatformEmailConnection {
  id: string;
  user_id: string;
  profile_id: string;

  provider: EmailProvider;
  email_address: string;
  display_name: string | null;

  // Resend-specific dedicated domain verification.
  resend_api_key_encrypted: string | null;
  resend_domain: string | null;
  resend_domain_id: string | null;
  resend_dkim_status: "pending" | "verified" | "failed" | null;

  // Generic provider credentials (non-Resend).
  provider_api_key_encrypted: string | null;
  provider_oauth_access_token_encrypted: string | null;
  provider_oauth_refresh_token_encrypted: string | null;
  provider_oauth_expires_at: string | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PlatformEmailConnectionPublic = Omit<
  PlatformEmailConnection,
  | "resend_api_key_encrypted"
  | "provider_api_key_encrypted"
  | "provider_oauth_access_token_encrypted"
  | "provider_oauth_refresh_token_encrypted"
>;

// ---------------------------------------------------------------------------
// Email — per-app state
// ---------------------------------------------------------------------------

/** Hyperlocal's per-connection state. provider_metadata holds
 *  Mailchimp audience id, AC list id, SendGrid webhook public key,
 *  etc. — app code owns the inner shape. */
export interface HlEmailAppMetadata {
  mailchimp?: {
    dc?: string;
    audience_id?: string;
    server_prefix?: string;
  };
  activecampaign?: {
    account_url?: string;
    list_id?: number;
  };
  constantcontact?: {
    account_id?: string;
    default_list_id?: string;
  };
  sendgrid?: {
    domain_id?: number | string;
    webhook_endpoint?: string;
    webhook_error?: string | null;
    /** AES-encrypted SendGrid event-webhook signing public key. */
    webhook_signing_public_key?: string | null;
  };
}

/** CMA's per-connection state. Mostly mirrors Hyperlocal — the only
 *  v2 transactional path is Resend + SendGrid, so the campaign-mode
 *  provider metadata is theoretical. */
export interface CmaEmailAppMetadata {
  sendgrid?: {
    domain_id?: number | string;
    webhook_endpoint?: string;
    webhook_error?: string | null;
    webhook_signing_public_key?: string | null;
  };
}

export interface AppEmailConnectionStateBase {
  id: string;
  connection_id: string;
  webhook_id: string | null;
  webhook_secret_encrypted: string | null;
  is_default: boolean;
  last_send_at: string | null;
  last_error: string | null;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AppEmailConnectionState =
  | (AppEmailConnectionStateBase & {
      app: "hyperlocal";
      provider_metadata: HlEmailAppMetadata;
    })
  | (AppEmailConnectionStateBase & {
      app: "listing_studio";
      provider_metadata: CmaEmailAppMetadata;
    });

/** Public projection — strips the per-app webhook secret. The
 *  webhook_secret_set bool replaces it so the UI can render a "secret
 *  is configured" indicator without exposing the bytes. */
export type AppEmailConnectionStatePublic =
  | (Omit<AppEmailConnectionStateBase, "webhook_secret_encrypted"> & {
      app: "hyperlocal";
      provider_metadata: HlEmailAppMetadata;
      webhook_secret_set: boolean;
    })
  | (Omit<AppEmailConnectionStateBase, "webhook_secret_encrypted"> & {
      app: "listing_studio";
      provider_metadata: CmaEmailAppMetadata;
      webhook_secret_set: boolean;
    });

// ---------------------------------------------------------------------------
// Joined views (what API endpoints actually return)
// ---------------------------------------------------------------------------

/** A CRM connection joined with its state for one specific app. The
 *  shape API endpoints return when fetching "this app's connections."
 *  Pre-resolved on the server so client code can just render. */
export interface AppCrmConnection<App extends AppSlug = AppSlug> {
  connection: PlatformCrmConnectionPublic;
  state: Extract<AppCrmConnectionState, { app: App }>;
}

/** Mirror for email. */
export interface AppEmailConnection<App extends AppSlug = AppSlug> {
  connection: PlatformEmailConnectionPublic;
  state: Extract<AppEmailConnectionStatePublic, { app: App }>;
}
