// ---------------------------------------------------------------------------
// Hyperlocal — type definitions
// Mirrors structure of types/blog-engine.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export type SegmentationType =
  | "zip"
  | "city"
  | "county"
  | "subdivision"
  | "neighborhood"
  | "custom";

export type CampaignLens = "seller" | "buyer" | "balanced";

export interface HlCampaign {
  id: string;
  user_id: string;
  name: string;

  segmentation: SegmentationType;
  custom_segmentation_field?: string | null;

  property_type_filters: string[];
  price_range_low?: number | null;
  price_range_high?: number | null;
  source_filters: string[];

  lens: CampaignLens;
  min_segment_size: number;

  /** ZIPs (or city/county/etc geo keys) this campaign serves. Empty means
   *  "ask the user per run" via the awaiting_service_area phase. */
  service_area_zips: string[];

  is_active: boolean;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Sender Profile (platform-scoped)
// ---------------------------------------------------------------------------

export interface PlatformSenderProfile {
  id: string;
  user_id: string;

  full_name: string;
  title?: string | null;
  brokerage?: string | null;
  phone?: string | null;
  reply_to_email?: string | null;
  license_number?: string | null;
  /** Free text describing supervising / sponsoring broker (CA, TX, IL etc.). */
  license_info?: string | null;
  /** "Texas Real Estate Commission" — agency the license is issued by. */
  regulatory_body?: string | null;
  /** State the agent operates in (ISO 2-letter code or display name). Drives state-aware disclosure rules at render time. */
  state?: string | null;

  physical_address: string;       // CAN-SPAM requirement
  sign_off: string;

  is_default: boolean;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Branding Profile (platform-scoped)
// ---------------------------------------------------------------------------

export type CornerStyle = "sharp" | "soft" | "rounded" | "pill";
export type ButtonShape = "pill" | "rounded" | "square";
export type Density = "compact" | "standard" | "airy";
export type HeaderTreatment = "solid" | "gradient" | "image";

export interface PlatformBrandingProfile {
  id: string;
  user_id: string;
  name: string;

  primary_color: string;
  secondary_color: string;
  accent_color: string;

  heading_font: string;
  body_font: string;

  motifs?: string | null;
  corner_style: CornerStyle;
  button_shape: ButtonShape;
  density: Density;
  header_treatment: HeaderTreatment;
  header_image_url?: string | null;
  metric_box_style: string;
  divider_style: string;

  logo_url?: string | null;
  headshot_url?: string | null;
  brokerage_badge_url?: string | null;
  legal_disclaimer?: string | null;

  is_default: boolean;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CRM Connections
// ---------------------------------------------------------------------------

export type CrmPlatform =
  | "followupboss"
  | "lofty"
  | "sierra"
  | "boldtrail"
  | "cinc"
  | "cloze"
  | "gohighlevel"
  | "csv";

export const CRM_PLATFORM_LABELS: Record<CrmPlatform, string> = {
  followupboss: "Follow Up Boss",
  lofty: "Lofty",
  sierra: "Sierra Interactive",
  boldtrail: "BoldTrail (kvCORE)",
  cinc: "CINC",
  cloze: "Cloze",
  gohighlevel: "GoHighLevel",
  csv: "CSV Upload",
};

export type SearchAreaSource = "field" | "tag-pattern" | "none";

export interface CsvColumnMapping {
  first_name_column?: string;
  last_name_column?: string;
  email_column?: string;
  phone_column?: string;
  street_column?: string;
  city_column?: string;
  state_column?: string;
  zip_column?: string;
  combined_address_column?: string;
  tags_column?: string;
  source_column?: string;
  storage_path?: string;       // path inside hyperlocal-uploads bucket
}

export interface HlCrmConnection {
  id: string;
  user_id: string;

  platform: CrmPlatform;
  label?: string | null;

  api_key_encrypted?: string | null;
  oauth_access_token_encrypted?: string | null;
  oauth_refresh_token_encrypted?: string | null;
  oauth_expires_at?: string | null;
  base_url?: string | null;

  column_mapping?: CsvColumnMapping | null;

  search_area_source?: SearchAreaSource | null;
  search_area_column?: string | null;
  search_area_tag_pattern?: string | null;

  is_active: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Email Connections
// ---------------------------------------------------------------------------

export type EmailProvider =
  | "resend"
  | "sendgrid"
  | "mailchimp"
  | "activecampaign"
  | "constantcontact"
  | "klaviyo";

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  resend: "Resend (verified domain)",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  constantcontact: "Constant Contact",
  klaviyo: "Klaviyo",
};

export type ResendDkimStatus = "pending" | "verified" | "failed";

export interface HlEmailConnection {
  id: string;
  user_id: string;

  provider: EmailProvider;
  email_address: string;
  display_name?: string | null;

  resend_api_key_encrypted?: string | null;
  resend_webhook_secret_encrypted?: string | null;
  resend_domain?: string | null;
  resend_domain_id?: string | null;
  resend_dkim_status?: ResendDkimStatus | null;

  // Generic credentials used by non-Resend providers (SendGrid, future
  // OAuth-based marketing ESPs). The Resend-named columns above stay
  // populated only for Resend connections — they don't migrate.
  provider_api_key_encrypted?: string | null;
  provider_oauth_access_token_encrypted?: string | null;
  provider_oauth_refresh_token_encrypted?: string | null;
  provider_oauth_expires_at?: string | null;
  /** Per-ESP JSON grab-bag (Mailchimp dc, AC list_id, SendGrid domain_id, etc.) */
  provider_metadata?: Record<string, unknown> | null;

  paused?: boolean;
  paused_reason?: string | null;
  paused_at?: string | null;

  is_active: boolean;
  is_default: boolean;

  last_send_at?: string | null;
  last_error?: string | null;

  created_at: string;
  updated_at: string;

  /** Client-side only: true when `resend_webhook_secret_encrypted` is populated.
   *  The encrypted secret itself is never sent to the client. */
  webhook_secret_set?: boolean;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type RunPhase =
  | "discover"
  | "awaiting_service_area"
  | "awaiting_mls"
  | "awaiting_audience_confirmation"
  | "generate"
  | "review"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled";

export const RUN_PHASE_LABELS: Record<RunPhase, string> = {
  discover: "Discovering",
  awaiting_service_area: "Pick your service area",
  awaiting_mls: "Waiting for MLS data",
  awaiting_audience_confirmation: "Confirm audience changes",
  generate: "Generating drafts",
  review: "Awaiting review",
  sending: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface HlRun {
  id: string;
  user_id: string;
  campaign_id?: string | null;

  sender_profile_id?: string | null;
  branding_profile_id?: string | null;
  email_connection_id?: string | null;
  crm_connection_id?: string | null;

  phase: RunPhase;

  contacts_fetched: number;
  segments_count: number;
  emails_drafted: number;
  emails_sent: number;
  emails_failed: number;

  error?: string | null;

  started_at?: string | null;
  completed_at?: string | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export type SegmentStatus = "pending" | "ready" | "rolled_up" | "skipped";

export interface MlsMetrics {
  median_sale_price?: number;
  median_days_on_market?: number;
  list_to_sale_ratio?: number;
  inventory_active?: number;
  closed_last_30_days?: number;
  closed_last_90_days?: number;
  price_change_yoy?: number;
  new_listings_last_30_days?: number;
}

export interface HlSegment {
  id: string;
  run_id: string;

  geo_key: string;
  geo_label?: string | null;
  geo_type?: SegmentationType | null;

  contact_count: number;
  seller_contact_count: number;
  buyer_contact_count: number;

  mls_upload_id?: string | null;
  mls_metrics?: MlsMetrics | null;

  status: SegmentStatus;
  rolled_up_into?: string | null;
  below_min_size: boolean;

  created_at: string;
}

// ---------------------------------------------------------------------------
// MLS Uploads
// ---------------------------------------------------------------------------

export type MlsFileFormat = "csv" | "xlsx" | "json";

export interface HlMlsUpload {
  id: string;
  run_id: string;
  user_id: string;

  filename: string;
  storage_path: string;
  file_size_bytes?: number | null;
  detected_format?: MlsFileFormat | null;
  detected_columns?: Record<string, unknown> | null;
  segment_assignments?: Record<string, number[]> | null;
  row_count?: number | null;

  uploaded_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Emails (drafts)
// ---------------------------------------------------------------------------

export type EmailStatus = "draft" | "approved" | "sending" | "sent" | "failed";

export interface HlEmail {
  id: string;
  run_id: string;
  segment_id: string;

  subject?: string | null;
  preheader?: string | null;
  html?: string | null;
  plain_text?: string | null;

  seller_perspective_html?: string | null;
  buyer_perspective_html?: string | null;

  status: EmailStatus;
  approved_at?: string | null;
  sent_at?: string | null;

  refinements_used: number;
  refinements_limit: number;
  last_edit_snapshot?: {
    subject: string;
    preheader: string;
    seller_perspective_html: string | null;
    buyer_perspective_html: string | null;
  } | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export type Perspective = "seller" | "buyer" | "both";

export type RecipientSendStatus =
  | "pending"
  | "suppressed"
  | "sent"
  | "bounced"
  | "complained"
  | "failed";

export interface HlRecipient {
  id: string;
  email_id: string;

  contact_external_id?: string | null;
  contact_email: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;

  perspective: Perspective;

  send_status: RecipientSendStatus;

  unsubscribe_token?: string | null;
  provider_message_id?: string | null;

  sent_at?: string | null;
  opened_at?: string | null;
  error_message?: string | null;

  created_at: string;
}

// ---------------------------------------------------------------------------
// Send Jobs
// ---------------------------------------------------------------------------

export type SendJobStatus = "queued" | "in_flight" | "done" | "failed";

export interface HlSendJob {
  id: string;
  recipient_id: string;
  email_connection_id: string;

  scheduled_at: string;
  attempts: number;
  last_error?: string | null;

  status: SendJobStatus;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Suppressions
// ---------------------------------------------------------------------------

export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "manual";

export interface HlSuppression {
  user_id: string;
  email: string;
  reason: SuppressionReason;
  added_at: string;
  source_run_id?: string | null;
}

// ---------------------------------------------------------------------------
// Normalized contact (CRM-agnostic)
// ---------------------------------------------------------------------------

export interface NormalizedContact {
  external_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  home_address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  search_areas: string[];
  tags: string[];
  source?: string;
}
