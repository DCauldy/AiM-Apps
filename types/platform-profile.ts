/**
 * platform_profiles — unified company-identity profile shared across all apps.
 *
 * A user owns one or more profiles. Apps read shared identity, market, brand,
 * contact, and compliance from here; their own tables hold only app-mechanical
 * config (schedule, connections, etc.) and reference this row via profile_id.
 *
 * See PROFILE_RESTRUCTURE_PLAN.md for full design rationale.
 */

export type ProfessionalType =
  | "solo_agent"
  | "team_leader"
  | "team_agent"
  | "broker_owner"
  | "loan_officer"
  | "title_executive";

export type CornerStyle = "sharp" | "soft" | "rounded" | "pill";
export type ButtonShape = "pill" | "rounded" | "square";
export type Density = "compact" | "standard" | "airy";
export type HeaderTreatment = "solid" | "gradient" | "image";

export interface PlatformProfile {
  id: string;
  user_id: string;

  // Meta
  display_name: string;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;

  // Identity
  full_name: string | null;
  title: string | null;
  professional_type: ProfessionalType | null;
  brokerage: string | null;
  bio: string | null;

  // Market
  country: string;
  state: string | null;
  metro_area: string | null;
  counties: string[];
  neighborhoods: string[];

  // Business focus
  target_clients: string[];
  specializations: string[];
  property_types: string[];

  // Contact / CAN-SPAM
  phone: string | null;
  reply_to_email: string | null;
  physical_address: string | null;
  sign_off: string | null;

  // Compliance
  license_number: string | null;
  license_info: string | null;
  regulatory_body: string | null;
  compliance_notes: string | null;
  legal_disclaimer: string | null;

  // Web presence
  website_url: string | null;
  blog_url: string | null;

  // Brand visuals
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  motifs: string | null;
  corner_style: CornerStyle;
  button_shape: ButtonShape;
  density: Density;
  header_treatment: HeaderTreatment;
  header_image_url: string | null;
  metric_box_style: string;
  divider_style: string;
  logo_url: string | null;
  headshot_url: string | null;
  brokerage_badge_url: string | null;

  // SEO
  seo_keywords: string[];
}

/** Input shape for creating a profile via the onboarding chat or /apps/profile/new. */
export type PlatformProfileInsert = Omit<
  PlatformProfile,
  "id" | "user_id" | "created_at" | "updated_at" | "archived_at" | "is_default"
> & {
  is_default?: boolean;
};

/** Input shape for partial updates via PATCH /api/profiles/[id]. */
export type PlatformProfileUpdate = Partial<
  Omit<PlatformProfile, "id" | "user_id" | "created_at" | "updated_at">
>;

/** Slim shape used by AppSwitcher and the "Operating as" header indicator. */
export interface ActiveProfileSummary {
  id: string;
  display_name: string;
  brokerage: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

/**
 * Extensions to the global profiles table for multi-profile state.
 * Lives on public.profiles, not platform_profiles.
 */
export interface UserProfileSlotState {
  active_profile_id: string | null;
  profile_slot_count: number;
  slot_grace_period_ends_at: string | null;
}
