/**
 * Effective-profile adapters — single source of truth for app-level reads
 * against the unified Profile system.
 *
 * Each adapter:
 *   1. Looks up profiles.active_profile_id for the user.
 *   2. Reads platform_profiles by that id and stitches in any app-specific
 *      extras that live elsewhere (e.g. Blog Engine extras on bofu_schedules).
 *   3. Returns null when no active profile is set, so callers can decide
 *      whether to redirect to /apps/profile/new or render an empty state.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BofuProfile } from "@/types/blog-engine";

// ---------------------------------------------------------------------------
// Blog Engine
// ---------------------------------------------------------------------------

/**
 * Returns a BofuProfile shape for Blog Engine consumers, stitching:
 *   - shared identity from platform_profiles
 *   - app-specific extras (CTAs, blog_tone, include_disclaimers,
 *     onboarding_completed) from bofu_schedules
 */
export async function getProfileForBlogEngine(userId: string): Promise<BofuProfile | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();
  if (!meta?.active_profile_id) return null;

  const [{ data: profile }, { data: schedule }] = await Promise.all([
    service
      .from("platform_profiles")
      .select("*")
      .eq("id", meta.active_profile_id)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("bofu_schedules")
      .select("cta_primary, cta_link, cta_secondary, cta_secondary_link, blog_tone, include_disclaimers, onboarding_completed, onboarding_chat_thread_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!profile) return null;

  const stitched: BofuProfile = {
    id: profile.id,
    user_id: profile.user_id,
    professional_type: profile.professional_type ?? "solo_agent",
    full_name: profile.full_name ?? "",
    business_name: profile.brokerage ?? null,
    bio: profile.bio ?? null,
    country: profile.country ?? "United States",
    state: profile.state ?? "",
    metro_area: profile.metro_area ?? "",
    counties: profile.counties ?? [],
    neighborhoods: profile.neighborhoods ?? [],
    target_clients: profile.target_clients ?? [],
    property_types: profile.property_types ?? [],
    specializations: profile.specializations ?? [],
    website_url: profile.website_url ?? null,
    blog_url: profile.blog_url ?? null,
    seo_keywords: profile.seo_keywords ?? [],
    brand_colors: {
      primary: profile.primary_color,
      secondary: profile.secondary_color,
      accent: profile.accent_color,
    },
    logo_url: profile.logo_url ?? null,
    cta_primary: schedule?.cta_primary ?? null,
    cta_link: schedule?.cta_link ?? null,
    cta_secondary: schedule?.cta_secondary ?? null,
    cta_secondary_link: schedule?.cta_secondary_link ?? null,
    license_info: profile.license_info ?? null,
    regulatory_body: profile.regulatory_body ?? null,
    compliance_notes: profile.compliance_notes ?? null,
    blog_tone: (schedule?.blog_tone as BofuProfile["blog_tone"]) ?? "professional",
    include_disclaimers: schedule?.include_disclaimers ?? true,
    onboarding_completed: schedule?.onboarding_completed ?? false,
    onboarding_chat_thread_id: schedule?.onboarding_chat_thread_id ?? null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  } as BofuProfile;

  return stitched;
}

// ---------------------------------------------------------------------------
// Hyperlocal
// ---------------------------------------------------------------------------

export interface HyperlocalSender {
  id: string;
  full_name: string;
  title: string | null;
  brokerage: string | null;
  phone: string | null;
  reply_to_email: string | null;
  license_number: string | null;
  physical_address: string;
  sign_off: string | null;
}

export interface HyperlocalBranding {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  motifs: string | null;
  corner_style: string;
  button_shape: string;
  density: string;
  header_treatment: string;
  header_image_url: string | null;
  metric_box_style: string;
  divider_style: string;
  logo_url: string | null;
  headshot_url: string | null;
  brokerage_badge_url: string | null;
  legal_disclaimer: string | null;
}

/** Returns the user's sender + branding derived from their active Profile. */
export async function getProfileForHyperlocal(
  userId: string
): Promise<{ sender: HyperlocalSender | null; branding: HyperlocalBranding | null }> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();
  if (!meta?.active_profile_id) return { sender: null, branding: null };

  const { data: profile } = await service
    .from("platform_profiles")
    .select("*")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return { sender: null, branding: null };

  const sender: HyperlocalSender | null = profile.physical_address
    ? {
        id: profile.id,
        full_name: profile.full_name ?? profile.display_name,
        title: profile.title,
        brokerage: profile.brokerage,
        phone: profile.phone,
        reply_to_email: profile.reply_to_email,
        license_number: profile.license_number,
        physical_address: profile.physical_address,
        sign_off: profile.sign_off,
      }
    : null;

  const branding: HyperlocalBranding = {
    id: profile.id,
    name: profile.display_name,
    primary_color: profile.primary_color,
    secondary_color: profile.secondary_color,
    accent_color: profile.accent_color,
    heading_font: profile.heading_font,
    body_font: profile.body_font,
    motifs: profile.motifs,
    corner_style: profile.corner_style,
    button_shape: profile.button_shape,
    density: profile.density,
    header_treatment: profile.header_treatment,
    header_image_url: profile.header_image_url,
    metric_box_style: profile.metric_box_style,
    divider_style: profile.divider_style,
    logo_url: profile.logo_url,
    headshot_url: profile.headshot_url,
    brokerage_badge_url: profile.brokerage_badge_url,
    legal_disclaimer: profile.legal_disclaimer,
  };

  return { sender, branding };
}

// ---------------------------------------------------------------------------
// Listing Studio
// ---------------------------------------------------------------------------

/**
 * Identity + brand bundle Listing Studio writers + renderers consume.
 * Pulled from the user's active platform_profiles row at generation time so
 * brand edits propagate to the next-rendered output without any cached state.
 */
export interface ListingStudioAgentProfile {
  // Identity
  full_name: string | null;
  title: string | null;
  brokerage: string | null;
  phone: string | null;
  reply_to_email: string | null;
  website_url: string | null;
  sign_off: string | null;
  bio: string | null;

  // Market context (used by emails for neighborhood phrasing)
  state: string | null;
  metro_area: string | null;

  // Compliance
  license_number: string | null;
  license_info: string | null;
  regulatory_body: string | null;
  legal_disclaimer: string | null;

  // Brand visuals
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  header_treatment: "solid" | "gradient" | "image";
  header_image_url: string | null;
  logo_url: string | null;
  headshot_url: string | null;
  brokerage_badge_url: string | null;
}

export async function getProfileForListingStudio(
  userId: string,
): Promise<ListingStudioAgentProfile | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();
  if (!meta?.active_profile_id) return null;

  const { data: profile } = await service
    .from("platform_profiles")
    .select("*")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    full_name: profile.full_name ?? null,
    title: profile.title ?? null,
    brokerage: profile.brokerage ?? null,
    phone: profile.phone ?? null,
    reply_to_email: profile.reply_to_email ?? null,
    website_url: profile.website_url ?? null,
    sign_off: profile.sign_off ?? null,
    bio: profile.bio ?? null,
    state: profile.state ?? null,
    metro_area: profile.metro_area ?? null,
    license_number: profile.license_number ?? null,
    license_info: profile.license_info ?? null,
    regulatory_body: profile.regulatory_body ?? null,
    legal_disclaimer: profile.legal_disclaimer ?? null,
    primary_color: profile.primary_color ?? "#1B7FB5",
    secondary_color: profile.secondary_color ?? "#17A697",
    accent_color: profile.accent_color ?? "#31DBA5",
    heading_font: profile.heading_font ?? "Inter",
    body_font: profile.body_font ?? "Inter",
    header_treatment: (profile.header_treatment as "solid" | "gradient" | "image") ?? "solid",
    header_image_url: profile.header_image_url ?? null,
    logo_url: profile.logo_url ?? null,
    headshot_url: profile.headshot_url ?? null,
    brokerage_badge_url: profile.brokerage_badge_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

export interface RadarIdentity {
  full_name: string | null;
  brokerage: string | null;
  metro_area: string | null;
  specializations: string[];
  website_url: string | null;
}

export async function getProfileForRadar(userId: string): Promise<RadarIdentity | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();
  if (!meta?.active_profile_id) return null;

  const { data: profile } = await service
    .from("platform_profiles")
    .select("full_name, brokerage, metro_area, specializations, website_url")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  return (profile as RadarIdentity) ?? null;
}

// ---------------------------------------------------------------------------
// Prompt Studio — silent system context
// ---------------------------------------------------------------------------

/**
 * Returns a short paragraph describing the active profile, suitable for
 * silent injection into the system prompt of every Prompt Studio conversation.
 *
 * Returns null when there is no active profile or no usable identity data,
 * in which case the caller should inject nothing.
 */
export async function getPromptStudioProfileContext(userId: string): Promise<string | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();
  if (!meta?.active_profile_id) return null;

  const { data: identity } = await service
    .from("platform_profiles")
    .select("full_name, brokerage, professional_type, metro_area, target_clients, specializations")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!identity?.full_name) return null;

  const parts: string[] = [];
  parts.push(`You are helping ${identity.full_name}`);
  if (identity.brokerage) parts.push(`at ${identity.brokerage}`);
  if (identity.professional_type) parts.push(`(${identity.professional_type.replace(/_/g, " ")})`);
  if (identity.metro_area) parts.push(`serving ${identity.metro_area}`);
  let sentence = parts.join(" ") + ".";

  if (identity.specializations && identity.specializations.length > 0) {
    sentence += ` Their specializations: ${identity.specializations.join(", ")}.`;
  }
  if (identity.target_clients && identity.target_clients.length > 0) {
    sentence += ` Their target clients: ${identity.target_clients.join(", ")}.`;
  }
  sentence += ` Keep responses on-brand and tuned for these specifics whenever relevant.`;
  return sentence;
}
